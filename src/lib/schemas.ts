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
	title: z.string().min(1),
	body: z.string().min(1),
	datetime: z.string().min(1),
	summary: z.string().nullable().optional(),
	imageUrl: httpUrl.nullable().optional(),
	section: z.enum(SECTIONS).optional(),
	published: z.boolean().optional(),
})

export const postUpdateSchema = postCreateSchema.partial()

// Projects

const projectLinkSchema = z.object({
	label: z.string().min(1),
	url: httpUrl,
	sortOrder: z.number().int().optional(),
})

const projectSectionImageSchema = z.object({
	url: httpUrl,
	caption: z.string().nullable().optional(),
	sortOrder: z.number().int().optional(),
})

const projectSectionSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	sortOrder: z.number().int().optional(),
	images: z.array(projectSectionImageSchema).optional(),
})

export const projectCreateSchema = z.object({
	name: z.string().min(1),
	summary: z.string().min(1),
	platform: z.string().min(1),
	role: z.string().nullable().optional(),
	accentColor: z.string().nullable().optional(),
	icon: httpUrl.nullable().optional(),
	heroImage: httpUrl.nullable().optional(),
	isFeatured: z.boolean().optional(),
	isDiscontinued: z.boolean().optional(),
	date: z.string().nullable().optional(),
	sortOrder: z.number().int().optional(),
	sections: z.array(projectSectionSchema).optional(),
	links: z.array(projectLinkSchema).optional(),
})

export const projectUpdateSchema = projectCreateSchema.partial()

// Auth

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
})
