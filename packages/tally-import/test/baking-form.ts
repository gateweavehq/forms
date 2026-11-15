import { bold, link, paragraph, TallyBuilder } from "./tally-builder";

/** A made-up survey about baking bread at home, written out the way Tally would hold it. */

export const STATUS = [
	"Never made it",
	"Made it once or twice",
	"Used to make it, but stopped",
	"Make it now and then",
	"Make it most weeks",
];

export const REASONS = [
	"It took too long",
	"It rarely turned out well",
	"Nobody at home ate it",
	"A shop near me makes it better",
	"Another reason",
];

interface Bread {
	code: string;
	name: string;
	definition: string;
	how: string;
}

export const GROUPS: Array<{ title: string; breads: Bread[] }> = [
	{
		title: "Loaves",
		breads: [
			{
				code: "B01",
				name: "Sandwich loaf",
				definition: "A soft, even loaf baked in a tin, made for slicing.",
				how: "The dough holds a little fat and sugar, and rises a second time in the tin.",
			},
			{
				code: "B02",
				name: "Sourdough loaf",
				definition: "A crusty loaf raised with a starter instead of baker's yeast.",
				how: "A starter is flour and water kept alive from bake to bake.",
			},
			{
				code: "B03",
				name: "Rye bread",
				definition: "A dense, dark loaf made mostly from rye flour.",
				how: "Rye has little gluten, so the loaf rises less and is often baked in a tin.",
			},
			{
				code: "B04",
				name: "Brioche",
				definition: "A rich loaf with butter and eggs worked into the dough.",
				how: "The butter goes in a piece at a time, and the dough is chilled before shaping.",
			},
		],
	},
	{
		title: "Flatbreads",
		breads: [
			{
				code: "B05",
				name: "Pita",
				definition: "A round flatbread that puffs into a pocket in a very hot oven.",
				how: "The pocket forms when the water in the dough turns to steam.",
			},
			{
				code: "B06",
				name: "Naan",
				definition: "A soft, leavened flatbread, by tradition baked in a clay oven.",
				how: "At home it is cooked in a very hot pan or under a grill.",
			},
			{
				code: "B07",
				name: "Flour tortillas",
				definition: "Thin rounds without yeast, cooked in a dry pan.",
				how: "The dough is rested and then rolled as thin as it will go.",
			},
		],
	},
	{
		title: "Small bakes",
		breads: [
			{
				code: "B08",
				name: "Bagels",
				definition: "Rings of dough boiled briefly, then baked.",
				how: "The boil sets the outside before the oven does.",
			},
			{
				code: "B09",
				name: "Soft pretzels",
				definition: "Knots of dough dipped in an alkaline bath before baking.",
				how: "The bath is what turns the crust deep brown.",
			},
		],
	},
];

/** Slips of the kind a form copied by hand picks up, each in the copy of the named bread. */
export interface Slips {
	/** Marks the "again" follow-up as required. */
	required?: string;
	/** Leaves a stray placeholder in the last text field. */
	placeholder?: string;
	/** Words one of the reasons differently. */
	wording?: string;
	/** Asks one more question at the end of the copy. */
	extraQuestion?: string;
	/** Gives the heading more words than the name the questions use. */
	longerHeading?: string;
	/** Puts a line of text above the first bread of the first group. */
	textAboveItems?: boolean;
}

function bread(form: TallyBuilder, { code, name, definition, how }: Bread, slips: Slips): void {
	const longer = slips.longerHeading === name;
	form.heading(2, longer ? `${code}: Notes on ${name} (yeasted)` : `${code}: ${name}`);
	form.text(`In short: ${definition}`);

	// A tick that only reveals two paragraphs.
	const [first, second] = [form.uuid(), form.uuid()];
	const more = form.checkboxes(["Show how it is made"]);
	form.logic(
		[{ field: more.group, comparison: "CONTAINS", value: more.options[0] ?? "" }],
		[first, second],
	);
	form.text([paragraph(bold("How it is made:"), `&nbsp;${how}`)], { hidden: true, as: first });
	form.text([paragraph(bold("At home: "), "No special equipment is needed.")], {
		hidden: true,
		as: second,
	});

	// The question asked for every bread, built as Tally builds it: a grid with one row.
	form.title(`Have you made ${name}?`);
	const status = form.matrix(STATUS, ["Options"]);
	const [why, other, again, fix, since] = [
		form.uuid(),
		form.uuid(),
		form.uuid(),
		form.uuid(),
		form.uuid(),
	];
	form.logic(
		[{ field: status.rows[0] ?? "", comparison: "IS", value: status.columns[2] ?? "" }],
		// The middle one is a block that was deleted since: Tally leaves such leftovers behind.
		[why, "99999999-0000-4000-8000-000000000000", again],
	);

	form.title(`Why did you stop making ${name}? Choose all that fit.`, { hidden: true });
	const reasons = REASONS.map((reason, index) =>
		slips.wording === name && index === 1 ? "It never turned out well" : reason,
	);
	const whyOptions = form.checkboxes(reasons, { hidden: true, as: why });
	form.logic([{ field: why, comparison: "CONTAINS", value: whyOptions.options[4] ?? "" }], [other]);
	form.title("What was the other reason?", { hidden: true });
	form.input("INPUT_TEXT", "", { hidden: true, as: other });

	form.title(`Would you make ${name} again?`, { hidden: true });
	const againOptions = form.multipleChoice(
		["Yes, when I have the time", "Only with a better recipe", "No"],
		{ hidden: true, as: again, required: slips.required === name },
	);
	form.logic(
		[{ field: again, comparison: "IS", value: againOptions.options[1] ?? "" }],
		[fix, since],
	);
	form.logic([{ field: again, comparison: "IS", value: againOptions.options[2] ?? "" }], [since]);
	form.title(`What would a better recipe for ${name} have to fix?`, { hidden: true });
	form.input("INPUT_TEXT", slips.placeholder === name ? "asdf" : "", { hidden: true, as: fix });
	form.title(`When did you last make ${name}?`, { hidden: true });
	form.multipleChoice(["This year", "Last year", "Longer ago"], { hidden: true, as: since });

	if (slips.extraQuestion === name) {
		form.title("Anything to add about it?");
		form.input("TEXTAREA");
	}
	form.divider();
}

/** The whole made-up form as Tally page data. */
export function bakingForm(slips: Slips = {}): unknown {
	const form = new TallyBuilder();

	// Page 1: what the survey is, and the consent.
	form.formTitle("Bread at home");
	form.text([
		["This is a made-up survey about baking bread at home, which takes "],
		bold("about three minutes"),
		["."],
	]);
	form.text([
		paragraph(["It has three parts:"]),
		[[[" - you and your kitchen;"]], [["tag", "div"]]],
		[[[" - nine breads;"]], [["tag", "div"]]],
		[[[" - last things."]], [["tag", "div"]]],
	]);
	form.blank();
	form.text([
		paragraph(
			["Please read the "],
			link("consent form", "https://example.org/consent"),
			[" first. Questions go to "],
			link("the baker", "mailto: baker@example.org"),
			["."],
			["", [["tag", "br"]]],
		),
	]);
	form.checkboxes(["I have read this and agree to take part."], { required: true });
	form.blank();

	// Page 2: questions of every kind.
	form.pageBreak();
	form.heading(1, "You and your kitchen");
	form.text("A few questions about how you bake.");
	form.title("K01: How often do you bake bread?");
	form.multipleChoice(["Most weeks", "About once a month", "A few times a year", "Other"], {
		other: true,
	});
	form.title("K02: For how many years have you baked bread at home?");
	form.text("Use a decimal for less than a year, such as 0.5.");
	form.input("INPUT_NUMBER", "Years");
	form.title("K03: What do you bake for, mostly?");
	form.checkboxes(["It tastes better", "It costs less", "I enjoy the work", "Other"], {
		other: true,
		max: 2,
	});
	form.title("K04: What do you bake in most often?");
	form.dropdown(["Electric oven", "Gas oven", "Wood-fired oven", "Bread machine"]);
	form.title("K05: Which flours are in your kitchen right now?");
	form.text("Wheat (for example, strong white)");
	form.input("INPUT_TEXT", "Wheat");
	form.text("Rye");
	form.input("INPUT_TEXT", "Rye");
	form.text("Anything else");
	form.input("INPUT_TEXT");
	form.title("K06: How often do you use each of these?");
	form.matrix(
		["Never", "Sometimes", "Every bake"],
		["Kitchen scale", "Thermometer", "Cast-iron pot"],
	);
	form.title("K07: What matters most to you in a loaf? Put these in order.");
	form.ranking(["The crust", "The crumb", "The flavour", "How long it keeps"]);
	form.title("K08: Do you keep a sourdough starter?");
	const starter = form.multipleChoice(["Yes", "I used to", "No"]);
	const age = form.uuid();
	form.logic([{ field: starter.group, comparison: "IS", value: starter.options[0] ?? "" }], [age]);
	form.title("How old is your starter, in years?", { hidden: true });
	form.input("INPUT_NUMBER", "Years", { hidden: true, as: age });

	// Page 3: text alone, introducing the breads.
	form.pageBreak();
	form.heading(1, "Nine breads");
	form.text("Next come nine breads in three groups.");
	form.text([["For each one, pick the line that "], bold("fits you best"), ["."]]);
	form.blank();

	// Pages 4 to 6: one page per group, the same questions written out for every bread.
	for (const group of GROUPS) {
		form.pageBreak(group.title);
		form.heading(1, group.title);
		form.divider();
		if (slips.textAboveItems && group === GROUPS[0]) form.text("These are all baked in an oven.");
		for (const item of group.breads) bread(form, item, slips);
	}

	// Page 7: an email address, a question that depends on it, and a comment.
	form.pageBreak();
	form.heading(1, "Last things");
	form.title("L01: Would you like the results? Leave an email address.");
	const email = form.input("INPUT_EMAIL");
	const contact = form.uuid();
	form.logic([{ field: email, comparison: "IS_NOT_EMPTY" }], [contact]);
	form.title("May we write to you about a follow-up survey?", { hidden: true });
	form.multipleChoice(["Yes", "No"], { hidden: true, as: contact });
	form.title("L02: Is there anything this survey should have asked?");
	form.input("TEXTAREA");
	form.blank();

	return form.pageData("Bread at home (copy)");
}
