// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const steelSessions=sqliteTable('steel_sessions',{
 tokenHash:text('token_hash').primaryKey(),client:text('client').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const steelAttempts=sqliteTable('steel_attempts',{
 identity:text('identity').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull(),
});
