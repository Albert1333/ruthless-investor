import { z } from "zod";
import { api, readBody, sessionIdSchema } from "@/lib/investor/http";
const schema = z.object({ sessionId: sessionIdSchema }).strict();
export async function POST(request: Request) {
  return api(request, "operation", async service => {
    const body = schema.parse(await readBody(request));
    return { session: await service.evaluate(body.sessionId) };
  });
}
