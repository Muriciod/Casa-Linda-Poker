PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_poker_roster` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`nickname` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'permanente' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_poker_roster`("id", "name", "nickname", "kind", "active", "created_at") SELECT "id", "name", "nickname", "kind", "active", "created_at" FROM `poker_roster`;--> statement-breakpoint
DROP TABLE `poker_roster`;--> statement-breakpoint
ALTER TABLE `__new_poker_roster` RENAME TO `poker_roster`;--> statement-breakpoint
PRAGMA foreign_keys=ON;