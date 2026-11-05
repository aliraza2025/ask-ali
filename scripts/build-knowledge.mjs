#!/usr/bin/env node
// Builds data/knowledge.json from the portfolio's HTML pages.
// Usage: node scripts/build-knowledge.mjs <portfolio-dir> [site-url]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const siteDir = process.argv[2];
const siteUrl = (process.argv[3] || "https://alirazaai.page").replace(/\/$/, "");

if (!siteDir) {
  console.error("Usage: node scripts/build-knowledge.mjs <portfolio-dir> [site-url]");
  process.exit(1);
}

const PAGES = [
  { file: "index.html", path: "/", title: "Home" },
  { file: "experience.html", path: "/experience", title: "Experience" },
  { file: "projects.html", path: "/projects", title: "Projects" },
  { file: "crediclip.html", path: "/crediclip", title: "CrediClip write-up" },
  { file: "presentations.html", path: "/presentations", title: "Presentations" },
  { file: "contact.html", path: "/contact", title: "Contact" },
  { file: "about-this-site.html", path: "/about-this-site", title: "About this site" },
  { file: "sources.html", path: "/sources", title: "Sources" },
  { file: "notes/index.html", path: "/notes/", title: "Field notes" },
  { file: "notes/crediclip-data-plane.html", path: "/notes/crediclip-data-plane", title: "Field note: CrediClip data plane" },
  { file: "notes/crediclip-ai-product-quality.html", path: "/notes/crediclip-ai-product-quality", title: "Field note: CrediClip AI product quality" },
  { file: "notes/estimator-data-plane.html", path: "/notes/estimator-data-plane", title: "Field note: Blue Ocean estimator data plane" },
  { file: "notes/raasta-product-experiment.html", path: "/notes/raasta-product-experiment", title: "Field note: Raasta product experiment" },
];

const MAX_CHUNK = 1400;

// Boilerplate sections that crowd out real answers in keyword search.
const SKIP_HEADINGS = /^(references|suggested citation|join the discussion|share|related|leave a message|contents|on this page)\b/i;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "-", mdash: "-", hellip: "…", rarr: "→" };

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function toText(html) {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h[1-6]|div|section|article|tr|dd|dt)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function stripChrome(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<a[^>]*class="skip-link"[^>]*>[\s\S]*?<\/a>/gi, "");
}

// Split on h1-h3 so each chunk carries its heading and the nearest anchor id.
function sections(html) {
  const out = [];
  const re = /<(h[1-3]|section|article)\b([^>]*)>/gi;
  let last = 0;
  let current = { heading: "", anchor: "" };
  let m;
  const push = (end) => {
    const text = toText(html.slice(last, end));
    if (text) out.push({ ...current, text });
  };
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const id = (m[2].match(/\bid="([^"]+)"/) || [])[1];
    if (tag.startsWith("h")) {
      push(m.index);
      last = m.index;
      const close = html.indexOf(`</${tag}>`, m.index);
      const heading = toText(html.slice(m.index, close === -1 ? m.index : close));
      current = { heading, anchor: id || current.anchor };
    } else if (id) {
      push(m.index);
      last = m.index;
      current = { heading: "", anchor: id };
    }
  }
  push(html.length);
  return out;
}

function splitLong(text) {
  if (text.length <= MAX_CHUNK) return [text];
  const parts = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (buf && buf.length + line.length > MAX_CHUNK) {
      parts.push(buf);
      buf = "";
    }
    buf += (buf ? "\n" : "") + line;
  }
  if (buf) parts.push(buf);
  return parts;
}

const chunks = [];
for (const page of PAGES) {
  const html = readFileSync(join(siteDir, page.file), "utf8");
  const pageTitle = decode((html.match(/<title>([^<]*)<\/title>/i) || [, page.title])[1]).trim();
  for (const s of sections(stripChrome(html))) {
    if (SKIP_HEADINGS.test(s.heading)) continue;
    for (const text of splitLong(s.text)) {
      if (text.length < 40) continue;
      chunks.push({
        id: chunks.length,
        page: page.title,
        pageTitle,
        heading: s.heading,
        url: siteUrl + page.path + (s.anchor ? `#${s.anchor}` : ""),
        text,
      });
    }
  }
}

// Dynamic project cards are rendered from JSON, so index their source catalog explicitly.
const catalog = JSON.parse(readFileSync(join(siteDir, "assets/ai-project-catalog.json"), "utf8"));
for (const item of catalog) {
  const text = [item.title, item.subtitle, item.description, "Stage: " + item.stage, "Verified: " + item.verification, "Limits: " + (item.limitations || "Independent prototype; see its repository for scope.")].filter(Boolean).join("\n");
  chunks.push({id:chunks.length,page:"Projects",pageTitle:"Raza Labs project catalog",heading:item.title,url:siteUrl+"/projects#ai-labs",text});
}

// Plain-text sources (e.g. the CV, extracted from its PDF) split on blank lines.
const TEXT_SOURCES = [
  { file: "sources/cv.txt", page: "CV", url: `${siteUrl}/experience` },
];
for (const src of TEXT_SOURCES) {
  const blocks = readFileSync(join(root, src.file), "utf8").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    for (const text of splitLong(block)) {
      chunks.push({
        id: chunks.length,
        page: src.page,
        pageTitle: "Ali Raza CV (PDF)",
        heading: text.split("\n")[0].slice(0, 120),
        url: src.url,
        text,
      });
    }
  }
}

mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(
  join(root, "data", "knowledge.json"),
  JSON.stringify({ site: siteUrl, builtAt: new Date().toISOString(), chunks }, null, 1)
);
console.log(`Wrote ${chunks.length} chunks from ${PAGES.length} pages and ${TEXT_SOURCES.length} text sources.`);
