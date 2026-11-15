CREATE TABLE `form` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`definition_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_hash`) REFERENCES `definition`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `form_owner_idx` ON `form` (`owner_id`);