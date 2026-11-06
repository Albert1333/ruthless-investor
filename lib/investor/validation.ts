import { startupPitchSchema } from "./model";
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
const instructionPattern = /(?:ignore|disregard|override)\s+(?:all|previous|system)|(?:system|developer)\s*(?:prompt|message)|(?:игнорируй|забудь|отмени)\s+(?:все|предыдущ|инструкц|правил)|(?:поставь|выставь|дай|оцени)\s+(?:мне\s+)?(?:10|десять)|раскрой\s+(?:системн|промпт)|reveal\s+(?:your|the)\s+(?:prompt|instructions)|give\s+(?:me\s+)?10\s*\/\s*10/iu;
export function containsInstruction(text: string): boolean { return instructionPattern.test(text); }
export function validatePitch(input: unknown): string {
  const parsed = startupPitchSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || "Проверьте описание проекта.");
  const pitch = parsed.data; validateUnicode(pitch);
  const words = pitch.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length < 8 || new Set(words.map(w => w.toLowerCase())).size < 6 || !/\p{L}{3}/u.test(pitch) || /(.)\1{15}/u.test(pitch)) throw new AppError("Опишите продукт, его клиента и проблему несколькими осмысленными предложениями.");
  const sentences = pitch.split(/[.!?\n]+/u).filter(s => s.trim());
  const instructionLength = sentences.filter(containsInstruction).reduce((n, s) => n + s.length, 0);
  if (containsInstruction(pitch) && (instructionLength / pitch.length > .35 || sentences.length <= 2)) throw new AppError("Здесь нужны сведения о стартапе. Команды изменить оценку или правила не считаются питчем.");
  return pitch;
}
export function validateUnicode(text: string) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new AppError("Текст содержит неподдерживаемые символы. Удалите их и повторите попытку.");
}
export function validateAnswer(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError("Напишите ответ. Если данных нет, можно честно сказать об этом.");
  const text = value.trim(); if (text.length > 4000) throw new AppError("Ответ должен быть не длиннее 4000 символов.");
  validateUnicode(text); return text;
}
export function sourceTexts(session: { pitch: string; answers: { text: string }[] }): string[] { return [session.pitch, ...session.answers.map(a => a.text)]; }
export function quoteExists(quote: string, texts: string[]): boolean { return texts.some(text => text.includes(quote)); }
