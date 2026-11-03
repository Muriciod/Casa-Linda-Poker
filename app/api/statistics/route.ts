import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";
import { buildPlayerProfiles, type StatisticsGame, type StatisticsRoster } from "../../../lib/player-statistics";

const headers = { "Cache-Control": "no-store" };
async function readHiddenKeys(db: Awaited<ReturnType<typeof ensureAppSchema>>) {
  const rows = await db.prepare("SELECT identity_key FROM poker_statistics_visibility WHERE hidden = 1").all<{ identity_key: string }>();
  return rows.results.map(row => row.identity_key);
}

export async function GET() {
  try {
    const db = await ensureAppSchema();
    return Response.json({ hiddenKeys: await readHiddenKeys(db) }, { headers });
  } catch {
    return Response.json({ error: "No se pudo cargar la visibilidad de los jugadores" }, { status: 500, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const { profileKey, hidden } = await request.json() as { profileKey?: string; hidden?: boolean };
    if (typeof profileKey !== "string" || typeof hidden !== "boolean") return Response.json({ error: "La preferencia no es válida" }, { status: 400 });
    const db = await ensureAppSchema();
    const [roster, games] = await Promise.all([
      db.prepare("SELECT id, name, nickname, kind FROM poker_roster WHERE active = 1").all<StatisticsRoster>(),
      db.prepare("SELECT data FROM poker_games UNION ALL SELECT data FROM poker_cash_games").all<{ data: string }>(),
    ]);
    const profiles = buildPlayerProfiles(games.results.map(row => JSON.parse(row.data) as StatisticsGame), roster.results);
    const profile = profiles.find(candidate => candidate.key === profileKey);
    if (!profile) return Response.json({ error: "No se encontró un jugador con historial o registro permanente. Recargá las estadísticas." }, { status: 404 });
    // Separate preferences only: never update players, sessions, results or Sheets.
    await db.batch(profile.identityKeys.map(key => db.prepare(`INSERT INTO poker_statistics_visibility (identity_key, hidden, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(identity_key) DO UPDATE SET hidden = excluded.hidden, updated_at = CURRENT_TIMESTAMP`).bind(key, hidden ? 1 : 0)));
    return Response.json({ hiddenKeys: await readHiddenKeys(db) }, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "No se pudo guardar la visibilidad. Intentá nuevamente." }, { status: 500, headers });
  }
}
