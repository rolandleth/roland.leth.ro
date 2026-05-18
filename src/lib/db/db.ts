import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"
import { getDatabaseUrl } from "@/lib/auth/env"

function createPrismaClient() {
	const adapter = new PrismaPg({ connectionString: getDatabaseUrl() })

	return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma
}

/** Returns true for Prisma P2025 "record not found" errors (e.g. update/delete on missing row). */
export function isPrismaNotFound(error: unknown): boolean {
	return isPrismaErrorCode(error, "P2025")
}

/** Returns true for Prisma P2002 "unique constraint violation" errors. */
export function isPrismaUniqueConstraint(error: unknown): boolean {
	return isPrismaErrorCode(error, "P2002")
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code: unknown }).code === code
	)
}
