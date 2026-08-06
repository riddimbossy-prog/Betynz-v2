import { readFile } from "node:fs/promises";

export function configuredValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (["replace_me", "change_me", "changeme", "none", "null", "undefined"].includes(lower)) return false;
  if (lower.includes("your-") || lower.includes("your_") || lower.includes("example.com")) return false;
  if (/^<.*>$/.test(raw)) return false;
  return true;
}

export async function loadLocalEnv() {
  if (process.env.NODE_ENV === "production") return;
  try {
    const text = await readFile(new URL("../../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {}
}
