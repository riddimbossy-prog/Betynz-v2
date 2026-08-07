import { configuredValue } from "./env.mjs";

const ACCESS_COOKIE = "betynz_admin_access";
const REFRESH_COOKIE = "betynz_admin_refresh";

function requiredConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuredValue(url) || !configuredValue(anon) || !configuredValue(service)) {
    const error = new Error("Supabase admin authentication is not configured.");
    error.code = "SUPABASE_AUTH_NOT_CONFIGURED";
    throw error;
  }
  return { url, anon, service };
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function cookie(name, value, maxAge) {
  const secure = String(process.env.NODE_ENV || "").toLowerCase() === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookies() {
  return [cookie(ACCESS_COOKIE, "", 0), cookie(REFRESH_COOKIE, "", 0)];
}

export function sessionCookies(session) {
  const accessTtl = Math.max(60, Number(session.expires_in || 3600));
  return [
    cookie(ACCESS_COOKIE, session.access_token, accessTtl),
    cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30)
  ];
}

async function supabaseFetch(path, options = {}, keyType = "anon") {
  const { url, anon, service } = requiredConfig();
  const key = keyType === "service" ? service : anon;
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function signInWithPassword(email, password) {
  const { response, body } = await supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    const error = new Error(body.error_description || body.msg || body.message || "Invalid email or password.");
    error.status = response.status;
    throw error;
  }
  return body;
}

async function refreshSession(refreshToken) {
  const { response, body } = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  return response.ok ? body : null;
}

async function fetchUser(accessToken) {
  const { url, anon } = requiredConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${accessToken}` }
  });
  return response.ok ? response.json() : null;
}

async function fetchProfile(userId) {
  const { response, body } = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,display_name`, {
    method: "GET",
    headers: { Prefer: "return=representation" }
  }, "service");
  if (!response.ok) return null;
  return Array.isArray(body) ? body[0] || null : null;
}

export async function getAdminSession(req) {
  const cookies = parseCookies(req);
  let accessToken = cookies[ACCESS_COOKIE];
  let refreshed = null;
  let user = accessToken ? await fetchUser(accessToken) : null;

  if (!user && cookies[REFRESH_COOKIE]) {
    refreshed = await refreshSession(cookies[REFRESH_COOKIE]);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      user = await fetchUser(accessToken);
    }
  }
  if (!user) return { authenticated: false, refreshed: null };

  const profile = await fetchProfile(user.id);
  const isAdmin = profile?.role === "admin";
  return {
    authenticated: isAdmin,
    user: { id: user.id, email: user.email, displayName: profile?.display_name || null, role: profile?.role || "user" },
    refreshed
  };
}

export function sameOriginRequest(req) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (!['POST','PUT','PATCH','DELETE'].includes(method)) return true;
  const site = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (site && !['same-origin','same-site','none'].includes(site)) return false;
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return true; // server-to-server/tests; SameSite=Strict still protects browser cookies
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
