import bcrypt from "bcryptjs"
import { jwtVerify, SignJWT, type JWTPayload } from "jose"
import { cookies } from "next/headers"

const COOKIE_NAME = "session"
const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days in seconds

export interface SessionPayload extends JWTPayload {
	admin: boolean
}

// Function (not a module-level constant) so tests can stub process.env.SESSION_SECRET.
export function getSessionSecret(): Uint8Array {
	const secret = process.env.SESSION_SECRET

	// v8 ignore next 3
	if (!secret) {
		throw new Error("SESSION_SECRET environment variable is not set")
	}

	return new TextEncoder().encode(secret)
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
		// eslint-disable-next-line no-console
		console.error("[auth:verifyToken]", code)

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

export async function verifyCredentials(
	email: string,
	password: string
): Promise<boolean> {
	const adminEmail = process.env.ADMIN_EMAIL
	const adminPasswordHash = process.env.ADMIN_HASH_PASSWORD

	if (!adminEmail || !adminPasswordHash) {
		return false
	}

	// ADMIN_HASH_PASSWORD is stored as hex to avoid env parsing issues with / and $ chars.
	const hash = Buffer.from(adminPasswordHash, "hex").toString()

	// Always run bcrypt regardless of email match to prevent timing-based user enumeration.
	const passwordMatch = await bcrypt.compare(password, hash)

	return email === adminEmail && passwordMatch
}
