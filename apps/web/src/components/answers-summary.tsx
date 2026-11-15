import {
	type Definition,
	flow,
	getAnswer,
	isAsking,
	itemOf,
	mergeItem,
	placesOf,
	type ResponseAnswers,
} from "@gateweave/forms-schema";
import { answerText } from "#/lib/answer-text";
import { strings } from "#/lib/strings";

interface Line {
	key: string;
	label: string;
	answer: string | undefined;
}

interface Block {
	key: string;
	title: string;
	lines: Line[];
}

/** The questions the person was asked, in the order they were asked, under their part or group. */
function blocksOf(definition: Definition, answers: ResponseAnswers): Block[] {
	const places = placesOf(definition);
	const blocks: Block[] = [];
	for (const step of flow(definition, answers)) {
		if (!isAsking(step)) continue;
		const question = places.questions.get(step.questionId)?.question;
		const section = definition.sections.find((one) => one.id === step.sectionId);
		if (!question || !section) continue;
		const place = step.kind === "question" ? undefined : places.items.get(step.itemId);
		const key = place ? `${section.id}:${place.group.id}` : section.id;
		const title =
			place && place.section.groups.length > 1
				? `${section.title}: ${place.group.title}`
				: section.title;
		let block = blocks[blocks.length - 1];
		if (block?.key !== key) {
			block = { key, title, lines: [] };
			blocks.push(block);
		}
		const item = place?.item;
		const single = step.kind === "status" && place?.section.block.status.length === 1;
		block.lines.push({
			key: step.key,
			label: !item
				? question.label
				: single
					? item.label
					: `${item.label}: ${mergeItem(question.label, item)}`,
			answer: answerText(question, getAnswer(answers, step.questionId, itemOf(step))?.value, item),
		});
	}
	return blocks;
}

/**
 * The person's own answers, for them to look over once they have finished: closed until they
 * ask. It is made in their browser from the response it already holds, so nothing is fetched
 * for it, and nothing in it is about anybody else.
 */
export function AnswersSummary({
	definition,
	answers,
}: {
	definition: Definition;
	answers: ResponseAnswers;
}) {
	const blocks = blocksOf(definition, answers);
	if (blocks.length === 0) return null;
	return (
		<details className="group rounded-xl border bg-card text-card-foreground">
			<summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-4 font-medium [&::-webkit-details-marker]:hidden">
				<span
					aria-hidden="true"
					className="inline-block text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
				>
					›
				</span>
				{strings.end.answersTitle}
			</summary>
			<div className="flex flex-col gap-6 px-4 pb-5">
				<p className="text-sm text-muted-foreground">{strings.end.answersNote}</p>
				{blocks.map((block) => (
					<section key={block.key} className="flex flex-col gap-2">
						<h2 className="text-sm font-semibold tracking-tight">{block.title}</h2>
						<dl className="flex flex-col divide-y border-y">
							{block.lines.map((line) => (
								<div key={line.key} className="flex flex-col gap-0.5 py-2">
									<dt className="text-sm break-words text-muted-foreground">{line.label}</dt>
									<dd className="break-words whitespace-pre-line">
										{line.answer ?? (
											<span className="text-muted-foreground">{strings.end.noAnswer}</span>
										)}
									</dd>
								</div>
							))}
						</dl>
					</section>
				))}
			</div>
		</details>
	);
}
