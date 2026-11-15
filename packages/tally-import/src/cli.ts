// Imports a Tally form from the command line:
//
//   pnpm import:tally <page-data.json | saved-page.html> [--out definition.json] [--id my-form]
//                     [--no-fold] [--accept-differences] [--detach-email]
//
// Prints what the form became and writes the definition when --out is given. The input is the
// JSON of the form page's __NEXT_DATA__ script, or the saved page itself.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Difference, type ImportReport, importTally } from "./index";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		out: { type: "string" },
		id: { type: "string" },
		"no-fold": { type: "boolean", default: false },
		"accept-differences": { type: "boolean", default: false },
		"detach-email": { type: "boolean", default: false },
	},
});

// pnpm runs a package's script from the package, so a relative path is taken from where the
// command was typed.
const from = process.env.INIT_CWD ?? process.cwd();
const [input] = positionals;
if (!input) {
	console.error("Which file? Pass the JSON of a Tally form page's __NEXT_DATA__ script.");
	process.exit(2);
}

function differences(list: Difference[]): string[] {
	return list.map(
		({ item, where, found, expected }) =>
			`    - "${item}", ${where}: ${JSON.stringify(found)} where most have ${JSON.stringify(expected)}`,
	);
}

function describe(report: ImportReport): string[] {
	const { source } = report;
	const lines = [
		report.title,
		`Source: ${source.pages} pages, ${source.blocks} blocks, ${source.rules} rules`,
		`Consent before the questions: ${report.hasConsent ? "yes" : "no"}`,
		"Sections:",
	];
	report.sections.forEach((section, index) => {
		if (section.type === "questions") {
			lines.push(`  ${index + 1}. questions "${section.id}": ${section.questions} questions`);
			return;
		}
		const groups = section.groups ?? [];
		const items = groups.reduce((count, group) => count + group.items, 0);
		lines.push(
			`  ${index + 1}. repeat "${section.id}": ${items} items in ${groups.length} groups (${groups.map((group) => group.items).join(", ")})`,
		);
		for (const answers of section.status ?? []) {
			lines.push(`     status, ${answers.length} answers: ${answers.join(" | ")}`);
		}
		lines.push(`     follow-ups: ${section.followUps ?? 0}`);
	});
	for (const fold of report.folded) {
		lines.push(
			`Folded pages ${fold.pages.join(", ")} into "${fold.section}" (${fold.items} items).`,
		);
		if (fold.settled.length > 0) {
			lines.push(`  ${fold.settled.length} differences settled by what most copies have:`);
			lines.push(...differences(fold.settled));
		}
	}
	for (const refusal of report.refused) {
		lines.push(
			`Not folded: pages ${refusal.pages.join(", ")} (${refusal.items} items) look like one block of questions repeated, but the copies differ in more than the item's name.`,
		);
		if (refusal.reason) lines.push(`  ${refusal.reason}`);
		lines.push(...differences(refusal.differences));
		if (!refusal.reason) {
			lines.push(
				"  Fix them in the source, or pass --accept-differences to take what most copies have.",
			);
		}
	}
	if (report.notes.length > 0) {
		lines.push("Notes:");
		lines.push(...report.notes.map((note) => `  - ${note}`));
	}
	return lines;
}

const result = importTally(readFileSync(resolve(from, input), "utf8"), {
	...(values.id ? { id: values.id } : {}),
	fold: !values["no-fold"],
	acceptDifferences: values["accept-differences"],
	detachEmail: values["detach-email"],
});

if (!result.ok) {
	console.error("This form cannot be imported:");
	for (const problem of result.problems) console.error(`  ${problem}`);
	process.exit(1);
}

console.log(describe(result.report).join("\n"));
if (values.out) {
	const out = resolve(from, values.out);
	writeFileSync(out, `${JSON.stringify(result.definition, null, "\t")}\n`);
	console.log(`Wrote ${out}`);
}
