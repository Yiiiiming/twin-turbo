CREATE TABLE `records` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`version` text NOT NULL,
	`laps` integer NOT NULL,
	`time_ms` integer NOT NULL,
	`name` text NOT NULL,
	`player_id` integer NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_id` ON `records` (`id`);--> statement-breakpoint
CREATE INDEX `records_ranking` ON `records` (`version`,`laps`,`time_ms`,`seq`);