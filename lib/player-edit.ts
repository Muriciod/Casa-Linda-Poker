import { normalizePlayerName } from "./player-statistics";
export function editParticipant(game: any, action: string, playerId: string, target: any) {
    if (game.status !== "active" || game.legacy)
        throw new Error("Reabrí una partida editable antes de corregir jugadores.");
    const player = game.players.find((p: any) => p.id === playerId);
    if (!player)
        throw new Error("Jugador no encontrado.");
    if (action === "remove")
        return { ...game, players: game.players.filter((p: any) => p.id !== playerId) };
    let replacement;
    if (action === "replace") {
        if (!target || game.mode === "temporary")
            throw new Error("Elegí un jugador registrado.");
        if (game.players.some((p: any) => p.id !== playerId && (p.id === target.id || [p.statisticsName || p.name, p.statisticsName ? p.statisticsNickname : p.nickname].filter(Boolean).some(n => [target.name, target.nickname].filter(Boolean).map(normalizePlayerName).includes(normalizePlayerName(n))))) || playerId === target.id)
            throw new Error("Ese jugador ya está en la mesa.");
        replacement = { ...player, id: target.id, name: target.name, nickname: target.nickname || "", avatar: (target.nickname || target.name).slice(0, 1).toUpperCase() };
        delete replacement.statisticsName;
        delete replacement.statisticsNickname;
    }
    else if (action === "rename") {
        const name = String(target?.name || "").trim();
        if (!name || name.length > 80)
            throw new Error("Ingresá un nombre de hasta 80 caracteres.");
        replacement = { ...player, statisticsName: player.statisticsName || player.name, statisticsNickname: player.statisticsNickname ?? player.nickname ?? "", name, nickname: "", avatar: name.slice(0, 1).toUpperCase() };
    }
    else
        throw new Error("Acción no válida.");
    return { ...game, players: game.players.map((p: any) => p.id === playerId ? replacement : p) };
}
