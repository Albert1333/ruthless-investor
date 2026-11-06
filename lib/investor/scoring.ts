import { CRITERIA, evaluationSchema, type EvaluationResult, type TrainingSession } from "./model";
import { containsInstruction, quoteExists, sourceTexts } from "./validation";
export function weightedScore(criteria: { score: number; weight: number }[]): number { return Math.round(criteria.reduce((sum, criterion) => sum + criterion.score * criterion.weight, 0)) / 100; }
export function validateEvaluation(value: unknown, session: Pick<TrainingSession, "pitch" | "answers">): EvaluationResult {
  const parsed = evaluationSchema.parse(value);
  if (new Set(parsed.criteria.map(c => c.criterion_id)).size !== 10) throw new Error("Повтор критерия в ответе модели.");
  const texts = sourceTexts(session);
  const criteria = CRITERIA.map(canonical => {
    const criterion = parsed.criteria.find(c => c.criterion_id === canonical.id)!;
    if (criterion.weight !== canonical.weight) throw new Error("Модель изменила вес критерия.");
    if (criterion.evidence_quotes.some(q => !quoteExists(q, texts))) throw new Error("Модель привела отсутствующую цитату.");
    if (criterion.evidence_quotes.some(containsInstruction)) throw new Error("Команда боту не может служить подтверждением бизнес-критерия.");
    if (criterion.evidence_quotes.length === 0 && criterion.score > 2) throw new Error("Высокая оценка не подкреплена цитатой.");
    return { ...criterion, weight: canonical.weight };
  });
  if (criteria.reduce((sum, c) => sum + c.weight, 0) !== 100) throw new Error("Неверная сумма весов.");
  if (new Set(parsed.recommendations.map(r => r.short_title.trim().toLowerCase())).size !== 3) throw new Error("Рекомендации повторяются.");
  return { ...parsed, criteria, weighted_score: weightedScore(criteria) };
}
