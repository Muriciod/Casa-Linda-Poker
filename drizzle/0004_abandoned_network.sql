CREATE TABLE `poker_bank_aliases` (
	`profile_key` text PRIMARY KEY NOT NULL,
	`alias` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `poker_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`amount` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
