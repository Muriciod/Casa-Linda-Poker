import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema, runtimeBindings } from "../../../lib/app-storage";
import { syncSheetsSnapshot } from "../../../lib/sheets-bridge";

const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

async function syncSnapshot(db: Awaited<ReturnType<typeof ensureAppSchema>>) {
  const [gameRows, rosterRows] = await Promise.all([
    db.prepare("SELECT data FROM poker_games ORDER BY started_at DESC").all<{ data: string }>(),
    db.prepare("SELECT id, name, nickname, kind, active, avatar_key AS avatarKey, created_at AS createdAt FROM poker_roster WHERE active = 1 ORDER BY name").all(),
  ]);
  const games = gameRows.results.flatMap((row) => { try { return [JSON.parse(row.data)]; } catch { return []; } });
  await syncSheetsSnapshot(games, rosterRows.results);
}

export async function GET(request: Request) {
  try {
    const playerId = new URL(request.url).searchParams.get("id");
    if (!playerId) return new Response("Foto no encontrada", { status: 404 });
    const db = await ensureAppSchema();
    const player = await db.prepare("SELECT avatar_key AS avatarKey FROM poker_roster WHERE id = ? AND active = 1").bind(playerId).first<{ avatarKey: string }>();
    if (!player?.avatarKey) return new Response("Foto no encontrada", { status: 404 });
    const bucket = (await runtimeBindings()).BUCKET;
    if (!bucket) return new Response("Almacenamiento no disponible", { status: 503 });
    const object = await bucket.get(player.avatarKey);
    if (!object) return new Response("Foto no encontrada", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=3600", ETag: object.etag } });
  } catch {
    return new Response("No se pudo cargar la foto", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const form = await request.formData();
    const playerId = String(form.get("playerId") ?? "").trim();
    const photo = form.get("photo");
    if (!playerId || !(photo instanceof File)) return Response.json({ error: "Elegí una foto válida" }, { status: 400 });
    const extension = allowedTypes[photo.type];
    if (!extension) return Response.json({ error: "Usá una imagen JPG, PNG, WebP o AVIF" }, { status: 400 });
    if (photo.size > 900 * 1024) return Response.json({ error: "La foto procesada sigue siendo demasiado pesada" }, { status: 400 });

    const db = await ensureAppSchema();
    const current = await db.prepare("SELECT avatar_key AS avatarKey FROM poker_roster WHERE id = ? AND active = 1").bind(playerId).first<{ avatarKey: string }>();
    if (!current) return Response.json({ error: "El jugador no está registrado como permanente" }, { status: 404 });
    const bucket = (await runtimeBindings()).BUCKET;
    if (!bucket) return Response.json({ error: "El almacenamiento de fotos no está disponible" }, { status: 503 });

    const safeId = playerId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "jugador";
    const avatarKey = `player-avatars/${safeId}/${crypto.randomUUID()}.${extension}`;
    await bucket.put(avatarKey, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type } });
    await db.prepare("UPDATE poker_roster SET avatar_key = ? WHERE id = ?").bind(avatarKey, playerId).run();
    if (current.avatarKey) await bucket.delete(current.avatarKey).catch(() => undefined);
    await syncSnapshot(db).catch(() => undefined);

    return Response.json({ avatarKey, avatarUrl: `/api/avatars?id=${encodeURIComponent(playerId)}&v=${encodeURIComponent(avatarKey)}` });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la foto" }, { status: 500 });
  }
}
