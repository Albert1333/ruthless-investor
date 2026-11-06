import { z } from "zod";
import { api, readBody, sessionIdSchema } from "@/lib/investor/http";
const startSchema = z.object({ pitch: z.unknown(), previousSessionId: sessionIdSchema.optional() }).strict();
export async function POST(request: Request) {
  return api(request, "start", async service => {
    const body = startSchema.parse(await readBody(request));
    return { session: await service.start(body.pitch, body.previousSessionId) };
  });
}
export async function GET(request: Request) {
  return api(request, "read", async (_service, store) => {
    const id = sessionIdSchema.parse(new URL(request.url).searchParams.get("id"));
    return { session: await store.get(id) };
  });
}
