import { env } from "cloudflare:workers";
import { z, ZodError } from "zod";
import { SessionFailure, TrainingService } from "./service";
import { SessionStore, enforceRateLimit } from "./store";
import { AppError } from "./validation";
import type { ProviderConfig } from "./provider";
export const sessionIdSchema = z.string().uuid();
export function providerConfig(): ProviderConfig {
  return {
    LLM_API_KEY: env.LLM_API_KEY || process.env.LLM_API_KEY,
    LLM_BASE_URL: env.LLM_BASE_URL || process.env.LLM_BASE_URL,
    LLM_MODEL: env.LLM_MODEL || process.env.LLM_MODEL,
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS,
  };
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError("Ожидается JSON-запрос.", 415);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AppError("Источник запроса не разрешён.", 403);
  if (Number(request.headers.get("content-length") || "0") > 50000) throw new AppError("Слишком большой запрос.", 413);
  if (!request.body) throw new AppError("Запрос пуст.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 50000) { await reader.cancel(); throw new AppError("Слишком большой запрос.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)); }
  catch { throw new AppError("Не удалось прочитать запрос."); }
}
export async function api(request: Request, category: "start" | "operation" | "read", action: (service: TrainingService, store: SessionStore) => Promise<unknown>) {
  try {
    if (!env.DB) throw new AppError("Серверное хранилище ещё не подключено. Настройте D1 и примените миграции.", 503);
    await enforceRateLimit(env.DB, request, category);
    const store = new SessionStore(env.DB);
    return json(await action(new TrainingService(store, providerConfig()), store));
  } catch (error) {
    if (error instanceof SessionFailure) return json({ error: error.message, session: error.session }, error.status);
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError) return json({ error: "Проверьте данные запроса. Идентификатор сессии или обязательные поля некорректны." }, 400);
    return json({ error: "Сервер временно недоступен. Сохранённый прогресс можно восстановить после повторной попытки." }, 503);
  }
}
