import { trainingSessionSchema, type TrainingSession } from "./model";
import { AppError } from "./validation";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCK_LEASE_MS = 65000;
type SessionRow = { data: string; revision: number };
export type LockedSession = { session: TrainingSession; revision: number };
export class SessionStore {
  constructor(private db: D1Database) {}
  async create(session: TrainingSession) {
    const now = Date.now();
    await this.db.prepare("INSERT INTO training_sessions (id,data,revision,lock_until,created_at,updated_at,expires_at) VALUES (?,?,0,0,?,?,?)")
      .bind(session.sessionId, JSON.stringify(trainingSessionSchema.parse(session)), now, now, now + SESSION_TTL_MS).run();
    await this.db.batch([
      this.db.prepare("DELETE FROM training_sessions WHERE id IN (SELECT id FROM training_sessions WHERE expires_at < ? LIMIT 100)").bind(now),
      this.db.prepare("DELETE FROM rate_buckets WHERE id IN (SELECT id FROM rate_buckets WHERE expires_at < ? LIMIT 100)").bind(now),
    ]);
  }
  async get(id: string): Promise<TrainingSession> {
    const row = await this.db.prepare("SELECT data, revision FROM training_sessions WHERE id = ? AND expires_at > ?").bind(id, Date.now()).first<SessionRow>();
    if (!row) throw new AppError("Сессия не найдена или срок хранения истёк. Начните новый раунд.", 404);
    return trainingSessionSchema.parse(JSON.parse(row.data));
  }
  async acquire(id: string): Promise<LockedSession> {
    const now = Date.now();
    const row = await this.db.prepare("UPDATE training_sessions SET lock_until = ?, revision = revision + 1 WHERE id = ? AND expires_at > ? AND lock_until <= ? RETURNING data, revision")
      .bind(now + LOCK_LEASE_MS, id, now, now).first<SessionRow>();
    if (!row) { await this.get(id); throw new AppError("Ответ уже обрабатывается. Подождите немного и восстановите сессию.", 409); }
    return { session: trainingSessionSchema.parse(JSON.parse(row.data)), revision: row.revision };
  }
  async save(lock: LockedSession, release = true) {
    lock.session.updatedAt = new Date().toISOString();
    const valid = trainingSessionSchema.parse(lock.session);
    const statement = release
      ? this.db.prepare("UPDATE training_sessions SET data = ?, updated_at = ?, lock_until = 0 WHERE id = ? AND revision = ?")
      : this.db.prepare("UPDATE training_sessions SET data = ?, updated_at = ? WHERE id = ? AND revision = ?");
    const result = await statement.bind(JSON.stringify(valid), Date.now(), valid.sessionId, lock.revision).run();
    if (!result.meta.changes) throw new AppError("Сессия уже обновилась. Восстановите её и продолжайте.", 409);
  }
  async release(lock: LockedSession) {
    await this.db.prepare("UPDATE training_sessions SET lock_until = 0 WHERE id = ? AND revision = ?").bind(lock.session.sessionId, lock.revision).run();
  }
}

export async function enforceRateLimit(db: D1Database, request: Request, category: "start" | "operation" | "read") {
  const ip = request.headers.get("cf-connecting-ip") || "local-anonymous";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  const now = Date.now(); const window = Math.floor(now / 3600000);
  const id = `${category}:${window}:${hash}`;
  const row = await db.prepare("INSERT INTO rate_buckets (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(id, (window + 2) * 3600000).first<{ count: number }>();
  const limit = category === "start" ? 20 : category === "operation" ? 180 : 600;
  if (!row || row.count > limit) throw new AppError("Слишком много запросов. Вернитесь к тренировке чуть позже.", 429);
}
