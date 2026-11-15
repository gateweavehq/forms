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
--> statement-breakpoint
CREATE TABLE `detached_answer` (
	`id` integer PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`answers` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `detached_answer_form_idx` ON `detached_answer` (`form_id`);--> statement-breakpoint
CREATE TABLE `response` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`definition_hash` text NOT NULL,
	`secret_seal` text NOT NULL,
	`device` text NOT NULL,
	`position` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `response_form_idx` ON `response` (`form_id`);