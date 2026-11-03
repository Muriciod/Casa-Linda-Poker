import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = await ensureAppSchema();
    const { results } = await db.prepare("SELECT data FROM poker_cash_games ORDER BY started_at DESC").all<{ data: string }>();
    const cell = (value: unknown) => '"' + (typeof value === "number" ? String(value) : String(value ?? "").replace(/^[=+@-]/, "'$&")).replaceAll('"', '""') + '"';
    const rows: unknown[][] = [["CASHGAME", "Fecha", "Estado", "Blinds", "Jugador", "Inversión Gs", "Recompras", "Cash-out Gs", "Resultado Gs"]];
    for (const row of results) {
      const game = JSON.parse(row.data);
      for (const player of game.players || []) {
        const investment = player.movements.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);
        rows.push([game.name, game.startedAt, game.status, game.blinds, player.nickname || player.name, game.legacy ? "" : investment, player.movements.filter((m: { type: string }) => m.type === "rebuy").length, player.cashOut, typeof player.legacyResult === "number" ? player.legacyResult : player.cashOut == null ? "" : player.cashOut - investment]);
      }
    }
    return new Response("\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="CASHGAME-real.csv"', "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "No se pudo exportar CASHGAME" }, { status: 500 });
  }
}
