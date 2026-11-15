// Stops a deploy whose build serves the example forms.
//
// `FORMS_EXAMPLES` makes the Worker serve the made-up forms in examples/ to anyone, with no
// owner. That is for local development and the tests' build (e2e/build.mjs sets it). A build
// made that way and then deployed would put those forms on a real address, so every deploy
// script runs this between building and deploying:
//
//   node scripts/check-deploy.mjs [path to the built wrangler.json]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** What is wrong with a built Worker's config for deploying, or nothing. */
export function deployProblem(config) {
	const value = config?.vars?.FORMS_EXAMPLES;
	if (value === undefined || value === "" || value === "0") return undefined;
	return `This build has FORMS_EXAMPLES set to ${JSON.stringify(value)}, which serves the example forms to anyone. It is a build for local development or the browser tests. Build again without FORMS_E2E in the environment, and deploy that.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const path = process.argv[2] ?? "dist/server/wrangler.json";
	let config;
	try {
		config = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		console.error(`Not deploying: ${path} could not be read, so the build cannot be checked.`);
		process.exit(1);
	}
	const problem = deployProblem(config);
	if (problem) {
		console.error(`Not deploying: ${problem}`);
		process.exit(1);
	}
}
