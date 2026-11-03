import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema, getSetting, putSetting } from "../../../lib/app-storage";
import { fetchSheetsSnapshot, testSheetsBridge } from "../../../lib/sheets-bridge";

const SHEET_ID = "16K-SubRvX6953dB8-_8kdRUAh5FRGAQB-SOfeYE8UCY";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [url, secret] = await Promise.all([getSetting("sheets_bridge_url"), getSetting("sheets_bridge_secret")]);
    return Response.json({ sheetId: SHEET_ID, connected: Boolean(url && secret), bridgeUrl: url ?? "" });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar la configuración" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = await request.json() as { bridgeUrl?: string; bridgeSecret?: string };
    const bridgeUrl = String(payload.bridgeUrl ?? "").trim();
    const bridgeSecret = String(payload.bridgeSecret ?? "").trim();
    if (!bridgeUrl.startsWith("https://script.google.com/macros/s/") || bridgeSecret.length < 12) return Response.json({ error: "Revisá la URL de Apps Script y usá una clave de 12 caracteres o más" }, { status: 400 });
    await testSheetsBridge(bridgeUrl, bridgeSecret);
    const snapshot = await fetchSheetsSnapshot(bridgeUrl, bridgeSecret);
    const db = await ensureAppSchema();
    const games = Array.isArray(snapshot.games) ? snapshot.games as Array<Record<string, unknown>> : [];
    const roster = Array.isArray(snapshot.roster) ? snapshot.roster as Array<Record<string, unknown>> : [];
    if (games.length) await db.batch(games.map((game) => db.prepare(`INSERT INTO poker_games (id, name, status, data, started_at, updated_at)
      SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (SELECT 1 FROM poker_game_modes WHERE id = ? AND mode <> 'chips')
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, data = excluded.data, started_at = excluded.started_at, updated_at = CURRENT_TIMESTAMP`)
      .bind(String(game.id), String(game.name), String(game.status), JSON.stringify(game), String(game.startedAt), String(game.id))));
    if (roster.length) await db.batch(roster.map((player) => db.prepare(`INSERT INTO poker_roster (id, name, nickname, kind, active, avatar_key, created_at)
      VALUES (?, ?, ?, ?, 1, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, nickname = excluded.nickname, kind = excluded.kind, active = 1,
      avatar_key = CASE WHEN excluded.avatar_key <> '' THEN excluded.avatar_key ELSE poker_roster.avatar_key END`)
      .bind(String(player.id), String(player.name), String(player.nickname ?? ""), "permanente", String(player.avatarKey ?? ""), player.createdAt ? String(player.createdAt) : null)));
    await Promise.all([putSetting("sheets_bridge_url", bridgeUrl), putSetting("sheets_bridge_secret", bridgeSecret)]);
    return Response.json({ connected: true, importedGames: games.length, importedPlayers: roster.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo conectar Google Sheets" }, { status: 500 });
  }
}
