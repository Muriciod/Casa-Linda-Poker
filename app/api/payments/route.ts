import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";
import { buildPlayerProfiles } from "../../../lib/player-statistics";
const headers = { "Cache-Control": "private, no-store" };
async function context() {
    const db = await ensureAppSchema();
    const rows = await db.prepare("SELECT data FROM poker_games UNION ALL SELECT data FROM poker_cash_games").all<{
        data: string;
    }>();
    const games = rows.results.map(r => JSON.parse(r.data));
    const roster = (await db.prepare("SELECT id, name, nickname, kind FROM poker_roster WHERE active = 1").all<any>()).results;
    return { db, games, profiles: buildPlayerProfiles(games, roster) };
}
export async function GET(request: Request) {
    try {
        await requireAdmin(request);
        const { db, games, profiles } = await context();
        const aliases = (await db.prepare("SELECT profile_key, alias FROM poker_bank_aliases").all<{
            profile_key: string;
            alias: string;
        }>()).results;
        const aliasFor = (profile: any) => profile ? profile.identityKeys.map((key: string) => aliases.find(a => a.profile_key === key)).find(Boolean)?.alias || "" : "";
        const gameId = new URL(request.url).searchParams.get("gameId");
        if (!gameId)
            return Response.json({ aliases: Object.fromEntries(profiles.map(p => [p.key, aliasFor(p)])) }, { headers });
        const game = games.find(g => g.id === gameId);
        if (!game || game.mode === "temporary" || game.status !== "finalized")
            return Response.json({ error: "La partida debe estar finalizada y guardada." }, { status: 400, headers });
        const payments = (await db.prepare("SELECT player_id, amount, completed FROM poker_transfers WHERE game_id = ?").bind(gameId).all<{
            player_id: string;
            amount: number;
            completed: number;
        }>()).results;
        const rows = game.players.map((p: any) => {
            const profile = profiles.find(pr => pr.sessions.some(s => s.game.id === gameId && s.player.id === p.id));
            const amount = Number.isSafeInteger(p.cashOut) && p.cashOut >= 0 ? p.cashOut : null;
            const paid = payments.find(x => x.player_id === p.id);
            return { id: p.id, name: p.nickname || p.name, profileKey: profile?.key, alias: aliasFor(profile), amount, completed: amount > 0 && paid?.amount === amount && paid?.completed === 1 };
        });
        return Response.json({ rows }, { headers });
    }
    catch (e) {
        if (e instanceof Response)
            return e;
        return Response.json({ error: "No se pudieron cargar los pagos." }, { status: 500, headers });
    }
}
export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const body = await request.json();
        const { db, games, profiles } = await context();
        if (body.action === "alias") {
            if (typeof body.alias !== "string" || body.alias.length > 160 || /[\x00-\x1f]/.test(body.alias) || !profiles.some(p => p.key === body.profileKey))
                return Response.json({ error: "Alias o perfil no válido." }, { status: 400, headers });
            await db.prepare("INSERT INTO poker_bank_aliases (profile_key, alias) VALUES (?, ?) ON CONFLICT(profile_key) DO UPDATE SET alias=excluded.alias").bind(body.profileKey, body.alias.trim()).run();
        }
        else if (body.action === "transfer") {
            const game = games.find(g => g.id === body.gameId);
            const player = game?.players.find((p: any) => p.id === body.playerId);
            if (!game || game.mode === "temporary" || game.status !== "finalized" || !player || !Number.isSafeInteger(player.cashOut) || player.cashOut <= 0 || player.cashOut !== body.amount || typeof body.completed !== "boolean")
                return Response.json({ error: "El capital cambió o no corresponde a un pago. Actualizá la lista." }, { status: 409, headers });
            const table = game.mode === "cash" ? "poker_cash_games" : "poker_games";
            const updated = await db.prepare(`INSERT INTO poker_transfers (id,game_id,player_id,amount,completed) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id=? AND data=?) ON CONFLICT(id) DO UPDATE SET amount=excluded.amount,completed=excluded.completed,updated_at=CURRENT_TIMESTAMP RETURNING id`)
                .bind(JSON.stringify([game.id, player.id]), game.id, player.id, player.cashOut, body.completed ? 1 : 0, game.id, JSON.stringify(game)).first();
            if (!updated)
                return Response.json({ error: "La partida cambió. Actualizá la lista." }, { status: 409, headers });
        }
        else
            return Response.json({ error: "Acción no válida." }, { status: 400, headers });
        return Response.json({ saved: true }, { headers });
    }
    catch (e) {
        if (e instanceof Response)
            return e;
        return Response.json({ error: "No se pudo guardar el cambio." }, { status: 500, headers });
    }
}
