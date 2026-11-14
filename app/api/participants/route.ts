import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";
import { editParticipant } from "../../../lib/player-edit";
export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const { gameId, playerId, action, targetId, name, expected } = await request.json();
        const db = await ensureAppSchema();
        const row = await db.prepare("SELECT data FROM poker_games WHERE id = ? UNION ALL SELECT data FROM poker_cash_games WHERE id = ?").bind(gameId, gameId).first<{
            data: string;
        }>();
        if (!row)
            return Response.json({ error: "No se encontró la partida." }, { status: 404 });
        const game = JSON.parse(row.data);
        if (expected !== row.data)
            return Response.json({ error: "La mesa cambió. Recargá antes de corregirla." }, { status: 409 });
        const target = action === "replace" ? await db.prepare("SELECT id, name, nickname FROM poker_roster WHERE id = ? AND active = 1").bind(targetId).first() : { name };
        const updated = editParticipant(game, action, playerId, target);
        const table = game.mode === "cash" ? "poker_cash_games" : "poker_games";
        const result = await db.prepare(`UPDATE ${table} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND data = ? RETURNING id`).bind(JSON.stringify(updated), gameId, row.data).first();
        if (!result)
            return Response.json({ error: "La mesa cambió. Recargá para continuar." }, { status: 409 });
        return Response.json({ game: updated });
    }
    catch (e) {
        if (e instanceof Response)
            return e;
        return Response.json({ error: e instanceof Error ? e.message : "No se pudo corregir." }, { status: 400 });
    }
}
