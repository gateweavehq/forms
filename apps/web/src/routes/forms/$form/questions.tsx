import { createFileRoute, notFound } from "@tanstack/react-router";
import { Counted, Nothing, QuestionCard } from "#/components/owner/results";
import { getResults, type ResultsOf } from "#/lib/results";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/questions")({
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }): Promise<ResultsOf<"questions">> => {
		const results = await getResults({ data: { form: params.form, view: "questions", ...deps } });
		if (results?.view !== "questions") throw notFound();
		return results;
	},
	component: QuestionsPage,
});

function QuestionsPage() {
	const { frame, sections } = Route.useLoaderData();
	return (
		<>
			<Counted frame={frame} />
			{frame.counted === 0 && <Nothing frame={frame} />}
			{sections.length === 0 && (
				<p className="text-muted-foreground">{strings.owner.results.noQuestions}</p>
			)}
			{frame.counted > 0 &&
				sections.map((section) => (
					<section key={section.id} className="flex flex-col gap-3">
						<h2 className="text-lg font-semibold break-words">{section.title}</h2>
						{section.questions.map((question) => (
							<QuestionCard key={question.id} summary={question} />
						))}
					</section>
				))}
		</>
	);
}
