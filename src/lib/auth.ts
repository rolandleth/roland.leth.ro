import bcrypt from "bcryptjs"
import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"

const COOKIE_NAME = "session"
const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days in seconds

// Function (not a module-level constant) so tests can stub process.env.SESSION_SECRET.
function getSecret(): Uint8Array {
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
		.sign(getSecret())

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

export async function verifySession(): Promise<boolean> {
	const cookieStore = await cookies()
	const token = cookieStore.get(COOKIE_NAME)?.value

	if (!token) {
		return false
	}

	try {
		await jwtVerify(token, getSecret())

		return true
	} catch {
		return false
	}
}

export async function verifyCredentials(
	email: string,
	password: string
): Promise<boolean> {
	const adminEmail = process.env.ADMIN_EMAIL
	const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH

	if (!adminEmail || !adminPasswordHash) {
		return false
	}

	// ADMIN_PASSWORD_HASH is stored as hex to avoid env parsing issues with / and $ chars.
	const hash = Buffer.from(adminPasswordHash, "hex").toString()

	// Always run bcrypt regardless of email match to prevent timing-based user enumeration.
	const passwordMatch = await bcrypt.compare(password, hash)

	return email === adminEmail && passwordMatch
}
