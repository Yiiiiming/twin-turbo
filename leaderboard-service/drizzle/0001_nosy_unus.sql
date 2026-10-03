ALTER TABLE `records` ADD `city` text DEFAULT 'coast' NOT NULL;--> statement-breakpoint
CREATE INDEX `records_city_ranking` ON `records` (`version`,`city`,`laps`,`time_ms`,`seq`);