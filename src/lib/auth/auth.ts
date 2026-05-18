import bcrypt from "bcryptjs"
import { jwtVerify, SignJWT, type JWTPayload } from "jose"
import { cookies } from "next/headers"
import {
	getAdminCredentials,
	getSessionSecret as getRawSessionSecret,
} from "@/lib/auth/env"

const COOKIE_NAME = "session"
const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days in seconds

export interface SessionPayload extends JWTPayload {
	admin: boolean
}

/**
 * Returns the JWT signing secret as a `Uint8Array` ready for `jose`. Reads via
 * `getRawSessionSecret` (lazy `process.env` read) so tests can stub the value
 * via `vi.stubEnv`.
 */
export function getSessionSecret(): Uint8Array {
	return new TextEncoder().encode(getRawSessionSecret())
}

export async function createSession(): Promise<void> {
	const token = await new SignJWT({ admin: true })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${SESSION_DURATION}s`)
		.sign(getSessionSecret())

	const cookieStore = await cookies()
	cookieStore.set(COOKIE_NAME, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: SESSION_DURATION,
		path: "/",
	})
}

export async function destroySession(): Promise<void> {
	const cookieStore = await cookies()
	cookieStore.delete(COOKIE_NAME)
}

/**
 * Verifies a raw JWT against the supplied secret and returns the decoded payload,
 * or `null` if verification fails for any reason (expired, tampered, garbage,
 * missing `admin` claim). Shared with the edge middleware so verification lives
 * in a single place.
 *
 * On failure, the reason is logged at error level so spikes in expired/tampered
 * tokens are visible in production (e.g. after a secret rotation). `jose` sets
 * a `code` like `ERR_JWT_EXPIRED` / `ERR_JWS_INVALID` / `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`
 * on the thrown error, which we forward verbatim.
 */
export async function verifyToken(
	token: string,
	secret: Uint8Array
): Promise<SessionPayload | null> {
	try {
		const { payload } = await jwtVerify(token, secret)

		// Runtime shape guard: a valid signature only proves the token came from us.
		// Callers use the returned value to gate admin access, so confirm the claim
		// explicitly rather than blindly casting any valid-signed JWT.
		if (payload.admin !== true) {
			// eslint-disable-next-line no-console
			console.error(
				"[auth:verifyToken] valid signature but missing admin claim"
			)

			return null
		}

		return payload as SessionPayload
	} catch (error) {
		const code =
			error instanceof Error && "code" in error
				? String((error as Error & { code: unknown }).code)
				: error instanceof Error
					? error.name
					: "unknown"

		// Routine session expiry should not pollute the error log: an admin
		// returning after a week generates one of these per request until they
		// re-login. Signature failures stay at error level so a secret-rotation
		// regression or token-tampering attempt is still visible as a spike.
		if (code === "ERR_JWT_EXPIRED") {
			// eslint-disable-next-line no-console
			console.info("[auth:verifyToken]", code)
		} else {
			// eslint-disable-next-line no-console
			console.error("[auth:verifyToken]", code)
		}

		return null
	}
}

export async function verifySession(): Promise<boolean> {
	const cookieStore = await cookies()
	const token = cookieStore.get(COOKIE_NAME)?.value

	if (!token) {
		return false
	}

	const payload = await verifyToken(token, getSessionSecret())

	return payload !== null
}

// Precomputed at module load so the no-credentials path below can still pay the
// bcrypt cost. Without this, an attacker can probe the login endpoint and
// detect "admin not configured yet" via response timing.
const dummyHash = bcrypt.hashSync("dummy", 10)

export async function verifyCredentials(
	email: string,
	password: string
): Promise<boolean> {
	const credentials = getAdminCredentials()

	// ADMIN_HASH_PASSWORD is stored as hex to avoid env parsing issues with / and $ chars.
	const hash =
		credentials !== null
			? Buffer.from(credentials.passwordHash, "hex").toString()
			: dummyHash

	// Always run bcrypt regardless of email match (or even credential presence)
	// to prevent timing-based user enumeration / config-state probing.
	const passwordMatch = await bcrypt.compare(password, hash)

	if (credentials === null) {
		return false
	}

	return email === credentials.email && passwordMatch
}
