import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const trainingSessions = sqliteTable("training_sessions", {
  id: text("id").primaryKey(), data: text("data").notNull(),
  revision: integer("revision").notNull().default(0),
  lockUntil: integer("lock_until").notNull().default(0),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const rateBuckets = sqliteTable("rate_buckets", {
  id: text("id").primaryKey(), count: integer("count").notNull().default(1), expiresAt: integer("expires_at").notNull(),
});
