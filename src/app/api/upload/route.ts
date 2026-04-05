import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

export async function POST(request: Request): Promise<NextResponse> {
	if (process.env.NODE_ENV !== "production") {
		return NextResponse.json(
			{ error: "File uploads are only allowed in production" },
			{ status: 403 }
		)
	}

	const formData = await request.formData()
	const file = formData.get("file") as File | null

	if (!file) {
		return NextResponse.json({ error: "No file provided" }, { status: 400 })
	}

	const blob = await put(file.name, file, { access: "public" })

	return NextResponse.json({ url: blob.url })
}
