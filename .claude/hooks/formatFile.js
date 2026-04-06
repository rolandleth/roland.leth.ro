// @ts-nocheck
const { execFileSync } = require("child_process")
const path = require("path")

async function main() {
	const chunks = []

	for await (const chunk of process.stdin) {
		chunks.push(chunk)
	}

	const { tool_input } = JSON.parse(Buffer.concat(chunks).toString())
	const filePath = tool_input?.file_path || tool_input?.path

	if (!filePath) {
		return
	}

	const projectRoot = path.resolve(__dirname, "../..")
	const run = (args) => {
		try {
			execFileSync("yarn", args, { cwd: projectRoot, stdio: "pipe" })
		} catch {}
	}

	run(["prettier", "--write", filePath])

	if (/\.(js|jsx|ts|tsx|mjs|cjs|css|json)$/.test(filePath)) {
		run(["eslint", "--fix", filePath])
	}
}

main()
