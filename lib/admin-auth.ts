import { ensureAppSchema, runtimeBindings } from "./app-storage";

const COOKIE_NAME = "clp_admin";
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function hashPassword(password: string, salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 100000, salt: base64UrlToBytes(salt) }, key, 256);
  return { salt, hash: bytesToBase64Url(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const calculated = await hashPassword(password, salt);
  return safeEqual(base64UrlToBytes(calculated.hash), base64UrlToBytes(expectedHash));
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  return raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export async function readAdminSession(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const runtime = await runtimeBindings();
  if (!runtime.ADMIN_SESSION_SECRET) return null;
  const expected = await hmac(payload, runtime.ADMIN_SESSION_SECRET);
  if (!safeEqual(expected, base64UrlToBytes(signature))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { username: string; expiresAt: number };
    if (!data.username || data.expiresAt < Date.now()) return null;
    return { username: data.username };
  } catch {
    return null;
  }
}

export async function requireAdmin(request: Request) {
  const session = await readAdminSession(request);
  if (!session) throw new Response(JSON.stringify({ error: "Acceso de administrador requerido" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Response(JSON.stringify({ error: "Origen no autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } });
  return session;
}

export async function createSessionCookie(username: string) {
  const runtime = await runtimeBindings();
  if (!runtime.ADMIN_SESSION_SECRET) throw new Error("Falta configurar la seguridad del administrador");
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ username, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })));
  const signature = bytesToBase64Url(await hmac(payload, runtime.ADMIN_SESSION_SECRET));
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function adminSetupRequired() {
  const db = await ensureAppSchema();
  const row = await db.prepare("SELECT COUNT(*) AS total FROM poker_admins").first<{ total: number }>();
  return Number(row?.total ?? 0) === 0;
}
