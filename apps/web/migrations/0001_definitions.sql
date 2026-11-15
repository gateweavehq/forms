-- Written by hand over what Drizzle Kit generated (its snapshot is kept as generated). The
-- generated statements copied the old `response` rows into the new table, which cannot work:
-- the new columns have no value for them, and no stored definition exists for them to point at.
-- Responses from before this migration were only ever local test data, so both tables are made
-- anew. `answer` goes first because it refers to `response`.
CREATE TABLE `definition` (
	`hash` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `definition_form_idx` ON `definition` (`form_id`);--> statement-breakpoint
DROP TABLE `answer`;--> statement-breakpoint
DROP TABLE `response`;--> statement-breakpoint
CREATE TABLE `response` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`definition_hash` text NOT NULL,
	`answers_version` integer NOT NULL,
	`secret_seal` text NOT NULL,
	`device` text NOT NULL,
	`position` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`definition_hash`) REFERENCES `definition`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `response_form_idx` ON `response` (`form_id`);--> statement-breakpoint
CREATE TABLE `answer` (
	`response_id` text NOT NULL,
	`question_id` text NOT NULL,
	`item_id` text DEFAULT '' NOT NULL,
	`value` text,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`changes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`response_id`, `question_id`, `item_id`),
	FOREIGN KEY (`response_id`) REFERENCES `response`(`id`) ON UPDATE no action ON DELETE cascade
);
