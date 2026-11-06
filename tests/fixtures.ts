import type { TrainingSession } from "../lib/investor/model";
import { AppError } from "../lib/investor/validation";
import type { LockedSession, SessionStore } from "../lib/investor/store";

export const PITCH = "Мы создаём сервис подбора бариста для небольших кофеен. Владельцы теряют время в чатах, когда сотрудник не выходит на смену. Наш прототип проверили 8 владельцев. Цена одной смены 3000 рублей, комиссия 10%, переменные затраты 100 рублей. Платных заказов пока нет. Конкуренты — чаты и кадровые агентства. Главный риск — нехватка сотрудников. Бюджет рассчитан на три месяца.";
export function sessionFixture(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return { sessionId: crypto.randomUUID(), pitch: PITCH, personaId: "gromov", state: "QUESTION_GENERATION", currentQuestionIndex: 0, questions: [], answers: [], roundNumber: 1, mode: "test", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides };
}

// This fake exercises the service contract; it does not claim to verify D1 SQL.
export class MemoryStore {
  records = new Map<string, TrainingSession>();
  revisions = new Map<string, number>();
  locks = new Set<string>();
  asStore() { return this as unknown as SessionStore; }
  async create(session: TrainingSession) { this.records.set(session.sessionId, structuredClone(session)); this.revisions.set(session.sessionId, 0); }
  async get(id: string) { const value = this.records.get(id); if (!value) throw new AppError("Not found", 404); return structuredClone(value); }
  async acquire(id: string): Promise<LockedSession> {
    if (this.locks.has(id)) throw new AppError("Busy", 409);
    const session = await this.get(id); this.locks.add(id);
    const revision = (this.revisions.get(id) || 0) + 1; this.revisions.set(id, revision);
    return { session, revision };
  }
  async save(lock: LockedSession, release = true) {
    if (this.revisions.get(lock.session.sessionId) !== lock.revision) throw new AppError("Stale", 409);
    this.records.set(lock.session.sessionId, structuredClone(lock.session));
    if (release) this.locks.delete(lock.session.sessionId);
  }
  async release(lock: LockedSession) { if (this.revisions.get(lock.session.sessionId) === lock.revision) this.locks.delete(lock.session.sessionId); }
}

export function providerResponse(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200, headers: { "content-type": "application/json" } });
}
