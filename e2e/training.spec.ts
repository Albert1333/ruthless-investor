import { test, expect } from "@playwright/test";
import { PITCH } from "../tests/fixtures";
import type { TrainingSession } from "../lib/investor/model";

test("HTTP contract: five questions, duplicate protection, ten criteria and three recommendations", async ({ request }) => {
  const config = await request.get("/api/config");
  expect(config.ok()).toBeTruthy(); expect((await config.json()).mode).toBe("test");
  const invalid = await request.post("/api/session", { data: { pitch: "  " } }); expect(invalid.status()).toBe(400);
  const start = await request.post("/api/session", { data: { pitch: PITCH } }); expect(start.ok()).toBeTruthy();
  let s: TrainingSession = (await start.json()).session;
  for (let i=0;i<5;i++) {
    expect(s.questions).toHaveLength(i+1);
    const data = { sessionId:s.sessionId,questionId:s.questions.at(-1)!.id,answer:`Провели ${i+1} интервью, платных продаж пока нет.`,requestId:crypto.randomUUID() };
    const response = await request.post("/api/answer", {data}); expect(response.ok()).toBeTruthy();s=(await response.json()).session;
    const duplicate = await request.post("/api/answer", {data});expect(duplicate.ok()).toBeTruthy();expect((await duplicate.json()).session.answers).toHaveLength(i+1);
    const recovered = await request.get(`/api/session?id=${s.sessionId}`);expect((await recovered.json()).session.answers).toHaveLength(i+1);
  }
  expect(s.state).toBe("EVALUATING");expect(s.questions).toHaveLength(5);
  const sixth = await request.post("/api/question", {data:{sessionId:s.sessionId}});expect(sixth.status()).toBe(409);
  const evaluated = await request.post("/api/evaluate",{data:{sessionId:s.sessionId}});expect(evaluated.ok()).toBeTruthy();s=(await evaluated.json()).session;
  expect(s.state).toBe("COMPLETE");expect(s.evaluation!.criteria).toHaveLength(10);expect(s.evaluation!.recommendations).toHaveLength(3);
  const next = await request.post("/api/session",{data:{pitch:PITCH,previousSessionId:s.sessionId}});const second:TrainingSession=(await next.json()).session;expect(second.roundNumber).toBe(2);expect(second.answers).toHaveLength(0);expect(second.sessionId).not.toBe(s.sessionId);
});

test("browser journey: safe rendering, refresh recovery and a second five-answer round", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ТЕСТОВЫЙ РЕЖИМ", {exact:true}).first()).toBeVisible();
  await page.locator("#pitch").fill(PITCH);
  await page.getByRole("button",{name:/НАЧАТЬ ПРОЖАРКУ/}).click();
  await expect(page.locator("#answer")).toBeVisible();
  const hostile = '<img src=x onerror="window.__xssRan=true"> Данных пока нет.';
  for(let i=0;i<5;i++){
    await page.locator("#answer").fill(i===0?hostile:`Клиенты подтвердили проблему в ${i+1} интервью. Выручки ещё нет.`);
    await page.getByRole("button",{name:i===4?/ПОЛУЧИТЬ РАЗБОР/:/ОТВЕТИТЬ/}).click();
    if(i<4){await expect(page.locator(".question")).toHaveCount(i+2);await expect(page.locator("#answer")).toHaveValue("");}
    if(i===0){await page.reload();await expect(page.locator("#answer")).toBeVisible();await expect(page.getByText(hostile,{exact:true})).toBeVisible();expect(await page.evaluate(()=>Reflect.get(window,"__xssRan"))).toBeUndefined();}
  }
  await expect(page.getByRole("button",{name:/ПРОЙТИ ЕЩЁ РАЗ/})).toBeVisible();
  await page.getByRole("button",{name:/ПРОЙТИ ЕЩЁ РАЗ/}).click();
  await expect(page.locator("#pitch")).toHaveValue(PITCH);
  await page.getByRole("button",{name:/НАЧАТЬ ПРОЖАРКУ/}).click();
  for(let i=0;i<5;i++){
    await expect(page.locator("#answer")).toBeVisible();await page.locator("#answer").fill(`Во втором раунде уточнили гипотезу ${i+1}. Пока это утверждение, независимой проверки нет.`);
    await page.getByRole("button",{name:i===4?/ПОЛУЧИТЬ РАЗБОР/:/ОТВЕТИТЬ/}).click();
    if(i<4){await expect(page.locator(".question")).toHaveCount(i+2);await expect(page.locator("#answer")).toHaveValue("");}
  }
  await expect(page.getByRole("button",{name:/ПРОЙТИ ЕЩЁ РАЗ/})).toBeVisible();
  await expect(page.getByText(/Изменение качества/)).toBeVisible();
});

test("mobile landing has no horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");await expect(page.locator("#pitch")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

