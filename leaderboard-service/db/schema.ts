import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  id: text('id').notNull(), version: text('version').notNull(),
  laps: integer('laps').notNull(), timeMs: integer('time_ms').notNull(),
  name: text('name').notNull(), playerId: integer('player_id').notNull(),
  mode: text('mode').notNull(), createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('records_id').on(table.id), index('records_ranking').on(table.version, table.laps, table.timeMs, table.seq)]);
