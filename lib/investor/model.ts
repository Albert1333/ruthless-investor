import { z } from "zod";
export const CRITERIA = [
  { id: "feasibility", label: "Реализуемость решения", weight: 12 },
  { id: "business_model", label: "Бизнес-модель", weight: 14 },
  { id: "market", label: "Рынок и конкуренты", weight: 12 },
  { id: "financial_model", label: "Финансовая модель", weight: 12 },
  { id: "ip_registration", label: "Интеллектуальная собственность / регистрация", weight: 5 },
  { id: "traction", label: "Первые продажи и спрос", weight: 12 },
  { id: "risks", label: "Риски и их снижение", weight: 8 },
  { id: "planning", label: "Горизонт планирования", weight: 5 },
  { id: "uniqueness", label: "Уникальность продукта", weight: 8 },
  { id: "investment", label: "Инвестиционная привлекательность", weight: 12 },
] as const;
export const criterionIdSchema = z.enum(["feasibility", "business_model", "market", "financial_model", "ip_registration", "traction", "risks", "planning", "uniqueness", "investment"]);
export type CriterionId = z.infer<typeof criterionIdSchema>;
export const investorPersonaSchema = z.object({ id: z.string(), name: z.string(), role: z.string(), description: z.string() });
export const PERSONA = investorPersonaSchema.parse({ id: "gromov", name: "Виктор Громов", role: "Венчурный инвестор", description: "Скептик, который проверяет аргументы, а не самооценку. Ценит факты и честное «пока не знаю»." });
export type InvestorPersona = z.infer<typeof investorPersonaSchema>;
export const startupPitchSchema = z.string().trim().min(50, "Опишите идею хотя бы в 50 символах.").max(6000, "Питч должен быть не длиннее 6000 символов.");
export type StartupPitch = z.infer<typeof startupPitchSchema>;
export const questionSchema = z.object({ id: z.string(), text: z.string().min(10).max(1000), targetArea: z.string(), rationale: z.string(), relatedCriterionIds: z.array(criterionIdSchema).min(1).max(3) });
export type QuestionRecord = z.infer<typeof questionSchema>;
export const answerSchema = z.object({ questionId: z.string(), text: z.string(), requestId: z.string(), createdAt: z.string() });
export type AnswerRecord = z.infer<typeof answerSchema>;
export const evaluationCriterionSchema = z.object({
  criterion_id: criterionIdSchema, score: z.number().min(0).max(10), weight: z.number(),
  explanation: z.string().min(15).max(1200), evidence_quotes: z.array(z.string().min(1).max(400)).max(3),
  missing_evidence: z.array(z.string().min(3).max(400)).min(1).max(5), confidence: z.enum(["low", "medium", "high"]),
});
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;
export const recommendationSchema = z.object({
  short_title: z.string().min(3).max(100), problem_detected: z.string().min(10).max(500),
  exact_action: z.string().min(20).max(1000), expected_deliverable: z.string().min(10).max(500),
  time_estimate: z.string().min(2).max(80), priority: z.enum(["high", "medium", "low"]), related_criterion_ids: z.array(criterionIdSchema).min(1).max(3),
});
export type ActionableRecommendation = z.infer<typeof recommendationSchema>;
export const evaluationSchema = z.object({ criteria: z.array(evaluationCriterionSchema).length(10), recommendations: z.array(recommendationSchema).length(3), summary: z.string().min(10).max(1200) });
export type EvaluationResult = z.infer<typeof evaluationSchema> & { weighted_score: number };
export const sessionStateSchema = z.enum(["IDLE", "PITCH_VALIDATION", "QUESTION_GENERATION", "AWAITING_ANSWER", "ANSWER_PROCESSING", "EVALUATING", "COMPLETE", "RECOVERABLE_ERROR"]);
export const trainingSessionSchema = z.object({
  sessionId: z.string(), pitch: startupPitchSchema, personaId: z.string(), state: sessionStateSchema,
  currentQuestionIndex: z.number().int().min(0).max(5), questions: z.array(questionSchema).max(5), answers: z.array(answerSchema).max(5),
  createdAt: z.string(), updatedAt: z.string(), evaluation: evaluationSchema.extend({ weighted_score: z.number().min(0).max(10) }).optional(),
  roundNumber: z.number().int().positive(), previousSessionId: z.string().optional(), mode: z.enum(["test", "live"]),
  pendingAction: z.enum(["question", "evaluation"]).optional(), lastError: z.string().optional(),
});
export type TrainingSession = z.infer<typeof trainingSessionSchema>;
export const roundComparisonSchema = z.object({ before: z.number(), after: z.number(), difference: z.number(), note: z.string() });
export type RoundComparison = z.infer<typeof roundComparisonSchema>;
