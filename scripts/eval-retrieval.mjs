#!/usr/bin/env node
// Checks that the right source lands in the top results for each answerable question. No API key needed.

import { readFileSync } from "node:fs";
import { buildIndex } from "../lib/retrieve.js";
import { buildSources } from "../lib/answer.js";

const knowledge = JSON.parse(readFileSync(new URL("../data/knowledge.json", import.meta.url), "utf8"));
const questions = JSON.parse(readFileSync(new URL("../evals/questions.json", import.meta.url), "utf8"));
const index = buildIndex(knowledge.chunks);

let pass = 0;
let total = 0;
for (const item of questions.filter((q) => q.answerable)) {
  total += 1;
  const sources = buildSources(index, item.q, []);
  const ok = sources.some((c) =>
    (item.expectPage && c.page.startsWith(item.expectPage)) ||
    (item.expectText && c.text.toLowerCase().includes(item.expectText.toLowerCase()))
  );
  if (ok) pass += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${item.q}`);
  if (!ok) for (const c of sources) console.log(`        ${c.page} | ${c.heading.slice(0, 60)}`);
}
console.log(`\n${pass}/${total} answerable questions retrieved a matching source.`);
process.exit(pass === total ? 0 : 1);
