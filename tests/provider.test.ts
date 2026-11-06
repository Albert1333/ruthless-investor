import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuestion, requestStructured, validateGeneratedQuestion } from "../lib/investor/provider";
import { providerResponse, sessionFixture } from "./fixtures";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const config = { LLM_API_KEY: "test-only-provider-key", LLM_MODEL: "fake-test-model", LLM_BASE_URL: "https://provider.invalid/v1" };
const question = { text: "Какой факт подтверждает готовность клиента платить?", reference_quote: "Мы создаём сервис", targetArea: "traction", rationale: "Нужно отделить намерение от оплаченного спроса.", relatedCriterionIds: ["traction"] };
describe("bounded provider integration", () => {
  it("repairs malformed JSON once and validates the second output", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(providerResponse("{bad-json")).mockResolvedValueOnce(providerResponse({ ok:true })); vi.stubGlobal("fetch", fetcher);
    expect(await requestStructured(config, "task", { pitch:"test" }, x => x)).toEqual({ok:true}); expect(fetcher).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body); expect(body.messages[1].role).toBe("user"); expect(JSON.parse(body.messages[1].content)).toHaveProperty("untrusted_startup_data");
  });
  it("fails safely after two invalid outputs without returning a mock verdict", async () => {
    const fetcher=vi.fn().mockResolvedValue(providerResponse("broken")); vi.stubGlobal("fetch",fetcher);
    await expect(requestStructured(config,"task",{},x=>x)).rejects.toThrow(/прогресс сохранён/); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not retry a rejected secret or expose provider response text", async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response("private diagnostic secret",{status:401}));vi.stubGlobal("fetch",fetcher);
    await expect(requestStructured(config,"task",{},x=>x)).rejects.toThrow(/серверный API-ключ/);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts both attempts at the configured timeout", async () => {
    vi.useFakeTimers();const fetcher=vi.fn((_url:unknown,init:{signal:AbortSignal})=>new Promise((_resolve,reject)=>init.signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")))));vi.stubGlobal("fetch",fetcher);
    const result=requestStructured({...config,LLM_TIMEOUT_MS:"1000"},"task",{},x=>x); const rejected=expect(result).rejects.toThrow(/прогресс сохранён/); await vi.advanceTimersByTimeAsync(2100);await rejected;expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("requires a secret for live structured requests", async()=>{await expect(requestStructured({},"task",{},x=>x)).rejects.toThrow(/API-ключ/);});
  it("refuses plaintext remote provider URLs",async()=>{await expect(requestStructured({...config,LLM_BASE_URL:"http://external.invalid"},"task",{},x=>x)).rejects.toThrow(/настройку/);});
});
describe("question invariants",()=>{
  it("validates a pitch reference and adds it to one question",()=>{const q=validateGeneratedQuestion(question,sessionFixture());expect(q.text).toContain("«Мы создаём сервис»");expect(q.text.match(/\?/g)).toHaveLength(1);});
  it("rejects a reference absent from the last answer",()=>{const session=sessionFixture({answers:[{questionId:"q1",requestId:"r1",createdAt:"now",text:"Мы провели восемь интервью."}]});expect(()=>validateGeneratedQuestion(question,session)).toThrow(/контекст/);});
  it("requires context from the latest answer",()=>{const session=sessionFixture({answers:[{questionId:"q1",requestId:"r1",createdAt:"now",text:"Мы провели восемь интервью."}]});const q=validateGeneratedQuestion({...question,reference_quote:"восемь интервью"},session);expect(q.text).toContain("восемь интервью");});
  it("rejects bundles of questions",()=>expect(()=>validateGeneratedQuestion({...question,text:"Кто платит? И сколько?"},sessionFixture())).toThrow());
  it("rejects a repeated theme",()=>{const first=validateGeneratedQuestion(question,sessionFixture());expect(()=>validateGeneratedQuestion(question,sessionFixture({questions:[first]}))).toThrow(/повторяет/);});
  it("refuses a sixth generated question",async()=>{const q=validateGeneratedQuestion(question,sessionFixture());await expect(generateQuestion(sessionFixture({questions:Array(5).fill(q)}),{})).rejects.toThrow(/Шестого/);});
});
