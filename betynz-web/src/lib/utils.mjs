export const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
export const round = (value, digits = 1) => Number((Number(value) || 0).toFixed(digits));
export const pct = (hits, total) => total > 0 ? round((hits / total) * 100, 1) : null;
export const mean = values => {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};
export const normalizeName = value => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\b(fc|cf|sc|afc|club|calcio|fk|sk|ac|cd|ud)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
export const safeDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
export const isoDate = date => new Date(date).toISOString().slice(0, 10);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const impliedProbability = odds => Number(odds) > 1 ? 100 / Number(odds) : null;

export function similarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const aa = new Set(left.split(" ").filter(Boolean));
  const bb = new Set(right.split(" ").filter(Boolean));
  const intersection = [...aa].filter(x => bb.has(x)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = union ? intersection / union : 0;

  const bigrams = value => {
    const compact = value.replaceAll(" ", "");
    if (compact.length < 2) return new Set([compact]);
    return new Set(Array.from({ length: compact.length - 1 }, (_, i) => compact.slice(i, i + 2)));
  };
  const ab = bigrams(left);
  const bbig = bigrams(right);
  const common = [...ab].filter(x => bbig.has(x)).length;
  const dice = (ab.size + bbig.size) ? (2 * common) / (ab.size + bbig.size) : 0;

  const acronym = value => value.split(" ").filter(Boolean).map(x => x[0]).join("");
  const acronymMatch = acronym(left).length >= 2 && acronym(left) === acronym(right) ? 0.86 : 0;
  const prefixMatch = [...aa].some(x => [...bb].some(y => (x.length >= 3 && y.length >= 3) && (x.startsWith(y) || y.startsWith(x)))) ? 0.65 : 0;
  return Math.max(jaccard, dice, acronymMatch, prefixMatch);
}

export function withTimeout(ms, label = "request") {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error(`${label} timed out`)), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

export function pickFirst(...values) {
  return values.find(value => value !== undefined && value !== null && value !== "");
}
