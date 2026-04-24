import { z } from "zod"
import { SECTIONS } from "@/lib/sections"

// Only http/https allowed — prevents javascript: or data: XSS vectors.
// Add rel="noopener noreferrer" to any <a> rendering these on public pages.
const httpUrl = z
	.string()
	.url()
	.refine((u) => /^https?:/.test(u), {
		message: "URL must use http or https",
	})

// Posts

export const postCreateSchema = z.object({
	title: z.string().min(1).max(200),
	body: z.string().min(1).max(100_000),
	datetime: z.string().min(1),
	summary: z.string().max(300).nullable().optional(),
	imageUrl: httpUrl.nullable().optional(),
	section: z.enum(SECTIONS).optional(),
	published: z.boolean().optional(),
})

export const postUpdateSchema = postCreateSchema.partial()

// Projects

const projectLinkSchema = z.object({
	label: z.string().min(1).max(60),
	url: httpUrl,
	sortOrder: z.number().int().min(0).optional(),
})

const projectSectionImageSchema = z.object({
	url: httpUrl,
	caption: z.string().max(300).nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
})

const projectSectionSchema = z.object({
	title: z.string().min(1).max(200),
	description: z.string().min(1).max(100_000),
	sortOrder: z.number().int().min(0).optional(),
	images: z.array(projectSectionImageSchema).optional(),
})

// Accepts CSS hex color in #rgb, #rrggbb, #rgba, or #rrggbbaa form.
// A non-hex value renders a broken accent color on the project page, so
// we reject at the schema boundary rather than ship the raw string.
const hexColor = z
	.string()
	.regex(/^#[0-9a-fA-F]{3,8}$/, {
		message: "Must be a hex color like #rgb or #rrggbb",
	})
	.refine((v) => [4, 5, 7, 9].includes(v.length), {
		message: "Hex color must be 3, 4, 6, or 8 digits after the '#'",
	})

export const projectCreateSchema = z.object({
	name: z.string().min(1).max(80),
	summary: z.string().min(1).max(300),
	platform: z.string().min(1),
	role: z.string().max(80).nullable().optional(),
	accentColor: hexColor.nullable().optional(),
	icon: httpUrl.nullable().optional(),
	heroImage: httpUrl.nullable().optional(),
	isFeatured: z.boolean().optional(),
	isDiscontinued: z.boolean().optional(),
	date: z.string().nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	sections: z.array(projectSectionSchema).optional(),
	links: z.array(projectLinkSchema).optional(),
})

export const projectUpdateSchema = projectCreateSchema.partial()

// Auth

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
})
