import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex } from "../lib/retrieve.js";
import { answer } from "../lib/answer.js";

const knowledge = JSON.parse(readFileSync(join(process.cwd(), "data", "knowledge.json"), "utf8"));
const index = buildIndex(knowledge.chunks);

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "https://alirazaai.page,https://www.alirazaai.page,https://alirazatech.pages.dev,https://alirazaportfolio2026.netlify.app,http://127.0.0.1:8765,http://localhost:8765"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MODELS = (process.env.OPENROUTER_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);

// Best-effort limits; they reset whenever the serverless instance is recycled.
const PER_IP_LIMIT = 8;
const PER_IP_WINDOW_MS = 5 * 60 * 1000;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 300);
const hits = new Map();
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

function rateLimited(ip) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_LIMIT) return "daily";
  const recent = (hits.get(ip) || []).filter((t) => now - t < PER_IP_WINDOW_MS);
  if (recent.length >= PER_IP_LIMIT) return "ip";
  recent.push(now);
  hits.set(ip, recent);
  dayCount += 1;
  if (hits.size > 5000) hits.clear();
  return null;
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-4)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, chunks: knowledge.chunks.length, builtAt: knowledge.builtAt });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "Origin not allowed" });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return res.status(400).json({ error: "Ask a question." });
  if (question.length > 500) return res.status(400).json({ error: "Keep questions under 500 characters." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const limited = rateLimited(ip);
  if (limited) {
    return res.status(429).json({
      error: limited === "daily"
        ? "The assistant has reached today's limit. Please use the contact page or book a call."
        : "You're asking quickly. Please wait a few minutes and try again.",
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "The assistant isn't configured yet." });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const result = await answer({
      question,
      history: cleanHistory(body.history),
      index,
      apiKey,
      models: MODELS,
      referer: ALLOWED_ORIGINS[0],
      signal: controller.signal,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("ask failed", err.status, err.message, err.detail || "");
    const busy = err.name === "AbortError" || err.status === 429 || err.status === 502 || err.status === 503;
    return res.status(busy ? 503 : 500).json({
      error: busy
        ? "The free AI model is busy right now. Please try again in a minute."
        : "Something went wrong. Please try again, or use the contact page.",
    });
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
