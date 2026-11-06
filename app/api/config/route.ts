import { json, providerConfig } from "@/lib/investor/http";
import { sessionMode } from "@/lib/investor/service";
export function GET() { return json({ mode: sessionMode(providerConfig()) }); }
