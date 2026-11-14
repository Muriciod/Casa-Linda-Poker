import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pokerGames = sqliteTable("poker_games", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  data: text("data").notNull(),
  startedAt: text("started_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pokerAdmins = sqliteTable("poker_admins", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pokerRoster = sqliteTable("poker_roster", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nickname: text("nickname").notNull().default(""),
  kind: text("kind").notNull().default("permanente"),
  active: integer("active").notNull().default(1),
  avatarKey: text("avatar_key").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pokerSettings = sqliteTable("poker_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pokerBankAliases = sqliteTable("poker_bank_aliases", {
  profileKey: text("profile_key").primaryKey(),
  alias: text("alias").notNull().default(""),
});
export const pokerTransfers = sqliteTable("poker_transfers", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  playerId: text("player_id").notNull(),
  amount: integer("amount").notNull(),
  completed: integer("completed").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pokerAdminNotes = sqliteTable("poker_admin_notes", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});
