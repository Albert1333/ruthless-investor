import { z } from "zod";
import { api, readBody, sessionIdSchema } from "@/lib/investor/http";
const schema = z.object({ sessionId: sessionIdSchema, questionId: z.string().uuid(), answer: z.unknown(), requestId: z.string().min(8).max(100) }).strict();
export async function POST(request: Request) {
  return api(request, "operation", async service => {
    const body = schema.parse(await readBody(request));
    return { session: await service.answer(body.sessionId, body.questionId, body.answer, body.requestId) };
  });
}
