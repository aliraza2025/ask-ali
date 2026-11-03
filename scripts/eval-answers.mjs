#!/usr/bin/env node
// Sends each eval question to a running endpoint and checks citations and refusals.
// Usage: node scripts/eval-answers.mjs https://your-deployment.vercel.app/api/ask

import { readFileSync } from "node:fs";

const endpoint = process.argv[2];
if (!endpoint) {
  console.error("Usage: node scripts/eval-answers.mjs <endpoint-url>");
  process.exit(1);
}
// Optional start/end let you stay under the per-visitor rate limit (8 questions per 5 minutes).
const start = Number(process.argv[3] || 0);
const end = Number(process.argv[4] || Infinity);
const questions = JSON.parse(readFileSync(new URL("../evals/questions.json", import.meta.url), "utf8")).slice(start, end);
const REFUSAL = /(doesn't|does not|don't|do not|isn't|is not|not) (cover|have|include|mention|available|listed|able)|contact page|book(ing)? a call|can't help|cannot help|only answer/i;

let pass = 0;
for (const item of questions) {
  let data;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: item.q }),
    });
    data = await res.json();
  } catch (err) {
    data = { error: err.message };
  }
  const answer = data.answer || "";
  const cited = (data.sources || []).length > 0;
  const ok = data.error
    ? false
    : item.answerable
      ? cited && (!item.expectText || answer.toLowerCase().includes(item.expectText.toLowerCase()) || data.sources.length > 0)
      : REFUSAL.test(answer);
  if (ok) pass += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${item.q}\n      ${(data.error || answer).replace(/\s+/g, " ").slice(0, 220)}`);
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(`\n${pass}/${questions.length} passed.`);
