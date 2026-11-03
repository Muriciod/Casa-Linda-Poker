import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";

const seedNames = ["Mauri", "Iván", "Carlos R", "Max", "Fabri", "Carlos A", "Ale", "César", "Kevin", "Jaz (Kevin's gf)", "Axel", "Nano", "Mica"];
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function ensureRoster() {
  const db = await ensureAppSchema();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM poker_roster").first<{ total: number }>();
  if (Number(count?.total ?? 0) === 0) {
    await db.batch(seedNames.map((name) => db.prepare("INSERT OR IGNORE INTO poker_roster (id, name, nickname, kind, active) VALUES (?, ?, '', 'permanente', 1)").bind(`jugador-${slug(name)}`, name)));
  }
  return db;
}

export async function GET() {
  try {
    const db = await ensureRoster();
    const rows = await db.prepare("SELECT id, name, nickname, kind, active, avatar_key AS avatarKey, created_at AS createdAt FROM poker_roster WHERE active = 1 ORDER BY name COLLATE NOCASE").all<{ id: string; avatarKey: string }>();
    return Response.json({ roster: rows.results.map((player) => ({ ...player, avatarUrl: player.avatarKey ? `/api/avatars?id=${encodeURIComponent(player.id)}&v=${encodeURIComponent(player.avatarKey)}` : "" })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el padrón" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = await request.json() as { name?: string; nickname?: string };
    const name = String(payload.name ?? "").trim();
    const nickname = String(payload.nickname ?? "").trim();
    if (!name) return Response.json({ error: "El nombre es obligatorio" }, { status: 400 });
    const db = await ensureRoster();
    const id = `${slug(name)}-${crypto.randomUUID().slice(0, 8)}`;
    await db.prepare("INSERT INTO poker_roster (id, name, nickname, kind, active) VALUES (?, ?, ?, 'permanente', 1)").bind(id, name, nickname).run();
    return Response.json({ player: { id, name, nickname, kind: "permanente", active: 1, avatarKey: "", avatarUrl: "" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el jugador" }, { status: 500 });
  }
}
