const STOP = new Set(
  "a an and are as at be by can did do does for from has have he her his how i in is it its me my of on or our she that the their them there they this to was what when where which who why will with you your about ali raza ali's tell".split(" ")
);

export function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9.+#]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

function stem(t) {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

// Okapi BM25 over chunk heading + text. Headings count twice.
export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const tokens = tokenize(`${c.heading} ${c.heading} ${c.page} ${c.text}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { chunk: c, tf, len: tokens.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  return { docs, df, avgLen, n: docs.length };
}

export function search(index, query, { k = 6, k1 = 1.4, b = 0.75 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const scored = [];
  for (const d of index.docs) {
    let score = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t);
      const idf = Math.log(1 + (index.n - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avgLen)));
    }
    if (score > 0) scored.push({ score, chunk: d.chunk });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
