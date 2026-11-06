import { PERSONA, type TrainingSession } from "./model";
import { type ProviderConfig, generateEvaluation, generateQuestion } from "./provider";
import { SessionStore, type LockedSession } from "./store";
import { AppError, validateAnswer, validatePitch } from "./validation";

export function sessionMode(config: ProviderConfig): "live" | "test" { return config.LLM_API_KEY?.trim() ? "live" : "test"; }
export class SessionFailure extends AppError {
  constructor(message: string, status: number, public session: TrainingSession) { super(message, status); }
}
export class TrainingService {
  constructor(private store: SessionStore, private config: ProviderConfig) {}
  async start(pitchInput: unknown, previousSessionId?: string) {
    const pitch = validatePitch(pitchInput);
    const previous = previousSessionId ? await this.store.get(previousSessionId) : undefined;
    if (previous && previous.state !== "COMPLETE") throw new AppError("Сначала завершите предыдущий раунд.", 409);
    const now = new Date().toISOString();
    const session: TrainingSession = {
      sessionId: crypto.randomUUID(), pitch, personaId: PERSONA.id, state: "QUESTION_GENERATION",
      currentQuestionIndex: 0, questions: [], answers: [], createdAt: now, updatedAt: now,
      roundNumber: previous ? previous.roundNumber + 1 : 1, previousSessionId,
      mode: sessionMode(this.config), pendingAction: "question",
    };
    await this.store.create(session);
    return this.question(session.sessionId);
  }
  async question(sessionId: string) {
    const lock = await this.store.acquire(sessionId);
    try {
      const session = lock.session;
      if (session.questions.length === 5 || session.answers.length === 5) throw new AppError("Все пять вопросов уже заданы.", 409);
      if (session.questions.length > session.answers.length) { await this.store.release(lock); return session; }
      return await this.nextQuestion(lock);
    } catch (error) { await this.store.release(lock); throw error; }
  }
  async answer(sessionId: string, questionId: string, answerInput: unknown, requestId: string) {
    const answer = validateAnswer(answerInput);
    const lock = await this.store.acquire(sessionId);
    try {
      const session = lock.session;
      // Actual question identity, not a client counter, is the idempotency boundary.
      if (session.answers.some(a => a.questionId === questionId)) {
        if (session.pendingAction === "question" && session.questions.length === session.answers.length) return await this.nextQuestion(lock);
        await this.store.release(lock); return session;
      }
      if (session.answers.some(a => a.requestId === requestId)) throw new AppError("Этот запрос уже использован для другого ответа.", 409);
      const current = session.questions.at(-1);
      if (session.state !== "AWAITING_ANSWER" || !current || current.id !== questionId || session.answers.length >= 5 || session.questions.length !== session.answers.length + 1) {
        throw new AppError("Этот вопрос уже не активен. Восстановите сессию.", 409);
      }
      session.answers.push({ questionId, text: answer, requestId, createdAt: new Date().toISOString() });
      session.lastError = undefined;
      session.state = session.answers.length === 5 ? "EVALUATING" : "QUESTION_GENERATION";
      session.pendingAction = session.answers.length === 5 ? "evaluation" : "question";
      // Save the answer before waiting for an external provider; refresh/retry cannot lose it.
      await this.store.save(lock, false);
      if (session.answers.length === 5) { await this.store.save(lock); return session; }
      return await this.nextQuestion(lock);
    } catch (error) { await this.store.release(lock); throw error; }
  }
  async evaluate(sessionId: string) {
    const lock = await this.store.acquire(sessionId);
    try {
      const session = lock.session;
      if (session.state === "COMPLETE") { await this.store.release(lock); return session; }
      if (session.answers.length !== 5 || session.questions.length !== 5) throw new AppError("Для вердикта нужны все пять ответов.", 409);
      session.state = "EVALUATING"; session.pendingAction = "evaluation"; session.lastError = undefined;
      await this.store.save(lock, false);
      try {
        session.evaluation = await generateEvaluation(session, this.config);
        session.state = "COMPLETE"; session.pendingAction = undefined; session.lastError = undefined;
        await this.store.save(lock); return session;
      } catch (error) { return await this.recover(lock, error); }
    } catch (error) { await this.store.release(lock); throw error; }
  }
  private async nextQuestion(lock: LockedSession) {
    const session = lock.session;
    session.state = "QUESTION_GENERATION"; session.pendingAction = "question"; session.lastError = undefined;
    await this.store.save(lock, false);
    try {
      const question = await generateQuestion(session, this.config);
      session.questions.push(question); session.currentQuestionIndex = session.questions.length;
      session.state = "AWAITING_ANSWER"; session.pendingAction = undefined;
      await this.store.save(lock); return session;
    } catch (error) { return await this.recover(lock, error); }
  }
  private async recover(lock: LockedSession, error: unknown): Promise<never> {
    const message = error instanceof AppError ? error.message : "Не удалось завершить обработку. Ваши ответы сохранены — повторите попытку.";
    lock.session.state = "RECOVERABLE_ERROR"; lock.session.lastError = message;
    await this.store.save(lock);
    throw new SessionFailure(message, error instanceof AppError ? error.status : 503, lock.session);
  }
}
