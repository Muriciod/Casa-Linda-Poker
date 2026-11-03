import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";
import { deleteSheetsGame, syncSheetsSnapshot } from "../../../lib/sheets-bridge";

type StoredGame = { mode?: "chips" | "cash" | "temporary"; id: string; name: string; status: "active" | "finalized"; startedAt: string; [key: string]: unknown };

async function readRoster(db: Awaited<ReturnType<typeof ensureAppSchema>>) {
  const rows = await db.prepare("SELECT id, name, nickname, kind, active, avatar_key AS avatarKey, created_at AS createdAt FROM poker_roster WHERE active = 1 ORDER BY name").all();
  return rows.results;
}

async function syncChips(db: Awaited<ReturnType<typeof ensureAppSchema>>) {
  const pending = await db.prepare("SELECT id FROM poker_game_modes WHERE sheets_cleanup = 1").all<{ id: string }>();
  for (const row of pending.results) {
    await deleteSheetsGame(row.id);
    await db.prepare("UPDATE poker_game_modes SET sheets_cleanup = 0 WHERE id = ?").bind(row.id).run();
  }
  const snapshot = await db.prepare("SELECT data FROM poker_games ORDER BY started_at DESC").all<{ data: string }>();
  return syncSheetsSnapshot(snapshot.results.map((row) => JSON.parse(row.data)), await readRoster(db));
}

export async function GET() {
  try {
    const db = await ensureAppSchema();
    const response = await db.prepare("SELECT data, started_at FROM poker_games UNION ALL SELECT data, started_at FROM poker_cash_games ORDER BY started_at DESC").all<{ data: string }>();
    const games = response.results.flatMap((row) => { try { return [JSON.parse(row.data)]; } catch { return []; } });
    return Response.json({ games });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el historial" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = await request.json() as { games?: StoredGame[] };
    const games = Array.isArray(payload.games) ? payload.games : [];
    if (!games.length || games.some((game) => !game.id || !game.name || !game.startedAt)) return Response.json({ error: "Los datos de las partidas no son válidos" }, { status: 400 });
    if (games.some((game) => game.mode && !["chips", "cash"].includes(game.mode))) return Response.json({ error: "Las partidas temporales no se pueden guardar" }, { status: 400 });
    const db = await ensureAppSchema();
    // Existing IDs cannot be moved between ledgers by changing the mode.
    for (const game of games) {
      const assigned = await db.prepare("SELECT mode FROM poker_game_modes WHERE id = ?").bind(game.id).first<{mode: string}>();
      if (assigned && assigned.mode !== (game.mode || "chips")) return Response.json({ error: "La partida cambió de tipo. Recargá antes de seguir editando." }, { status: 409 });
      const otherTable = game.mode === "cash" ? "poker_games" : "poker_cash_games";
      if (await db.prepare(`SELECT id FROM ${otherTable} WHERE id = ?`).bind(game.id).first()) return Response.json({ error: "No se puede cambiar la base de una partida existente" }, { status: 409 });
    }
    await db.batch(games.map((game) => db.prepare(`INSERT INTO ${game.mode === "cash" ? "poker_cash_games" : "poker_games"} (id, name, status, data, started_at, updated_at)
      SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (SELECT 1 FROM poker_game_modes WHERE id = ? AND mode <> ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, data = excluded.data, started_at = excluded.started_at, updated_at = CURRENT_TIMESTAMP`)
      .bind(game.id, game.name, game.status, JSON.stringify(game), game.startedAt, game.id, game.mode || "chips")));
    let sheetsSynced = false;
    try { sheetsSynced = (await syncChips(db)).synced; } catch { /* D1 sigue siendo la copia segura */ }
    return Response.json({ saved: games.length, sheetsSynced });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los cambios" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Falta indicar la partida" }, { status: 400 });
    const db = await ensureAppSchema();
    const cash = new URL(request.url).searchParams.get("mode") === "cash";
    if (!cash) await deleteSheetsGame(id).catch(() => undefined);
    await db.prepare(`DELETE FROM ${cash ? "poker_cash_games" : "poker_games"} WHERE id = ?`).bind(id).run();
    const response = await db.prepare("SELECT data FROM poker_games ORDER BY started_at DESC").all<{ data: string }>();
    const games = response.results.flatMap((row) => { try { return [JSON.parse(row.data)]; } catch { return []; } });
    await syncSheetsSnapshot(games, await readRoster(db)).catch(() => undefined);
    return Response.json({ deleted: id });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo eliminar la partida" }, { status: 500 });
  }
}

// Only this explicit, authenticated operation may move a session between ledgers.
export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const payload = await request.json() as { id?: string; from?: string; mode?: string; game?: StoredGame };
    const { id, from, mode } = payload;
    const modes = ["chips", "cash", "temporary"];
    if (!id || !from || !mode || !modes.includes(from) || !modes.includes(mode) || from === mode) return Response.json({ error: "Elegí un tipo de partida diferente" }, { status: 400 });
    const db = await ensureAppSchema();
    const assigned = await db.prepare("SELECT mode FROM poker_game_modes WHERE id = ?").bind(id).first<{mode: string}>();
    if (assigned && assigned.mode !== from) return Response.json({ error: "El tipo de esta sesión cambió en otra pestaña. Recargá para continuar." }, { status: 409 });
    const sourceTable = from === "cash" ? "poker_cash_games" : "poker_games";
    let game: StoredGame;
    if (from === "temporary") {
      const existing = await db.prepare("SELECT id FROM poker_games WHERE id = ? UNION ALL SELECT id FROM poker_cash_games WHERE id = ?").bind(id, id).first();
      if (existing) return Response.json({ error: "Esta sesión ya tiene un registro guardado" }, { status: 409 });
      if (!payload.game || payload.game.id !== id || payload.game.mode !== "temporary" || !payload.game.name || !payload.game.startedAt || !Array.isArray(payload.game.players)) return Response.json({ error: "Faltan los datos de la partida temporal" }, { status: 400 });
      game = payload.game;
    } else {
      const row = await db.prepare(`SELECT data FROM ${sourceTable} WHERE id = ?`).bind(id).first<{data: string}>();
      if (!row) return Response.json({ error: "No se encontró la partida en el historial de origen" }, { status: 404 });
      game = JSON.parse(row.data);
    }
    const moved = { ...game, mode } as StoredGame;
    const statements = [db.prepare(`INSERT INTO poker_game_modes (id, mode, sheets_cleanup) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, sheets_cleanup=MAX(poker_game_modes.sheets_cleanup, excluded.sheets_cleanup)
      WHERE poker_game_modes.mode = ?`)
      .bind(id, mode, from === "chips" && !game.legacy ? 1 : 0, from)];
    if (mode !== "temporary") {
      const targetTable = mode === "cash" ? "poker_cash_games" : "poker_games";
      if (from === "temporary") {
        statements.push(db.prepare(`INSERT INTO ${targetTable} (id, name, status, data, started_at, updated_at)
          SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM poker_game_modes WHERE id = ? AND mode = ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status, data=excluded.data, started_at=excluded.started_at, updated_at=CURRENT_TIMESTAMP`)
          .bind(id, moved.name, moved.status, JSON.stringify(moved), moved.startedAt, id, mode));
      } else {
        statements.push(db.prepare(`INSERT INTO ${targetTable} (id, name, status, data, started_at, updated_at)
          SELECT id, name, status, json_set(data, '$.mode', ?), started_at, CURRENT_TIMESTAMP FROM ${sourceTable}
          WHERE id = ? AND EXISTS (SELECT 1 FROM poker_game_modes WHERE id = ? AND mode = ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status, data=excluded.data, started_at=excluded.started_at, updated_at=CURRENT_TIMESTAMP`)
          .bind(mode, id, id, mode));
      }
    }
    const tempSnapshotIndex = statements.length;
    if (mode === "temporary") statements.push(db.prepare(`SELECT data FROM ${sourceTable} WHERE id = ? AND EXISTS (SELECT 1 FROM poker_game_modes WHERE id = ? AND mode = ?)` ).bind(id, id, mode));
    if (from !== "temporary") statements.push(db.prepare(`DELETE FROM ${sourceTable} WHERE id = ? AND EXISTS (SELECT 1 FROM poker_game_modes WHERE id = ? AND mode = ?)`).bind(id, id, mode));
    // The classification CAS, destination and source removal commit atomically.
    const batchResult = await db.batch(statements) as Array<{results?: Array<{data: string}>}>;
    const finalMode = await db.prepare("SELECT mode FROM poker_game_modes WHERE id = ?").bind(id).first<{mode: string}>();
    if (finalMode?.mode !== mode) return Response.json({ error: "La sesión fue modificada en otra pestaña. Recargá para continuar." }, { status: 409 });
    const temporaryData = mode === "temporary" ? batchResult[tempSnapshotIndex]?.results?.[0]?.data : undefined;
    let resultGame = temporaryData ? { ...JSON.parse(temporaryData), mode } : moved;
    if (mode !== "temporary") {
      const row = await db.prepare(`SELECT data FROM ${mode === "cash" ? "poker_cash_games" : "poker_games"} WHERE id = ?`).bind(id).first<{data: string}>();
      if (row) resultGame = JSON.parse(row.data);
    }
    let sheetsPending = false;
    try { await syncChips(db); } catch { sheetsPending = true; }
    return Response.json({ game: resultGame, sheetsPending, legacySheetUnchanged: Boolean(game.legacy) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cambiar el tipo de partida" }, { status: 500 });
  }
}
