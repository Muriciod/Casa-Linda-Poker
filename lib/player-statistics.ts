// Shared by the statistics UI and the visibility API. No historical records are changed.
export type StatisticsPlayer = { id: string; name: string; nickname?: string; cashOut: number | null; legacyResult?: number; movements: { type: string; amount: number }[] };
export type StatisticsGame = { id: string; name: string; mode?: "chips" | "cash" | "temporary"; status: string; startedAt: string; blinds: string; legacy?: boolean; players: StatisticsPlayer[] };
export type StatisticsRoster = { id: string; name: string; nickname?: string; kind: string; avatarUrl?: string };
export type PlayerSession = { game: StatisticsGame; player: StatisticsPlayer };
export type PlayerProfile = { key: string; name: string; roster?: StatisticsRoster; identityKeys: string[]; sessions: PlayerSession[] };
export type StatisticsFilter = { mode: "chips" | "cash" | "all"; from: string; to: string };

export const normalizePlayerName = (value: string) => String(value || "")
  .replaceAll("Ã¡", "á").replaceAll("Ã©", "é").replaceAll("Ã­", "í").replaceAll("Ã³", "ó").replaceAll("Ãº", "ú").replaceAll("Ã±", "ñ").replaceAll("Â", "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const aliases = (player: { name: string; nickname?: string }) => [...new Set([player.name, player.nickname || ""].map(normalizePlayerName).filter(Boolean))];

export function buildPlayerProfiles(games: StatisticsGame[], roster: StatisticsRoster[]): PlayerProfile[] {
  const profiles = new Map<string, PlayerProfile>();
  const rosterById = new Map(roster.map(entry => [entry.id, entry]));
  const names = new Map<string, Set<string>>();
  for (const entry of roster) for (const alias of aliases(entry)) {
    if (!names.has(alias)) names.set(alias, new Set());
    names.get(alias)!.add(entry.id);
  }
  const ensure = (key: string, player: { name: string; nickname?: string }, entry?: StatisticsRoster) => {
    if (!profiles.has(key)) profiles.set(key, { key, name: entry?.nickname || entry?.name || player.nickname || player.name, roster: entry, identityKeys: [key], sessions: [] });
    return profiles.get(key)!;
  };
  for (const entry of roster) if (entry.kind !== "temporal") ensure(`id:${entry.id}`, entry, entry);
  for (const game of games) {
    // A temporary player must never contribute an identity, alias, session or result.
    if (game.mode === "temporary") continue;
    for (const player of game.players) {
      let entry = rosterById.get(player.id);
      if (!entry) {
        const matches = new Set(aliases(player).flatMap(alias => [...(names.get(alias) || [])]));
        if (matches.size === 1) entry = rosterById.get([...matches][0]);
      }
      const key = entry ? `id:${entry.id}` : `name:${normalizePlayerName(player.name || player.nickname || player.id)}`;
      const profile = ensure(key, player, entry);
      profile.sessions.push({ game, player });
      profile.identityKeys.push(`id:${player.id}`);
    }
  }
  // Only unambiguous aliases can bridge old name-only sessions to registered players.
  const owners = new Map<string, Set<string>>();
  for (const profile of profiles.values()) {
    const values = [...(profile.roster ? aliases(profile.roster) : []), ...profile.sessions.flatMap(s => aliases(s.player))];
    for (const value of values) {
      if (!owners.has(value)) owners.set(value, new Set());
      owners.get(value)!.add(profile.key);
    }
  }
  for (const [alias, keys] of owners) if (keys.size === 1) profiles.get([...keys][0])!.identityKeys.push(`name:${alias}`);
  for (const profile of profiles.values()) {
    profile.identityKeys = [...new Set(profile.identityKeys)];
    profile.sessions.sort((a, b) => b.game.startedAt.localeCompare(a.game.startedAt));
  }
  return [...profiles.values()];
}

export const isProfileHidden = (profile: PlayerProfile, hiddenKeys: readonly string[]) => profile.identityKeys.some(key => hiddenKeys.includes(key));
export function sessionResult({ game, player }: PlayerSession): number | null {
  if (game.status !== "finalized") return null;
  if (typeof player.legacyResult === "number" && Number.isFinite(player.legacyResult)) return player.legacyResult;
  if (player.cashOut === null || !Number.isFinite(player.cashOut)) return null;
  return player.cashOut - player.movements.reduce((sum, movement) => sum + movement.amount, 0);
}
export function sessionDay(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function filterSessions(sessions: PlayerSession[], filter: StatisticsFilter) {
  return sessions.filter(({ game }) => game.mode !== "temporary" && (filter.mode === "all" || (game.mode || "chips") === filter.mode)
    && (!filter.from || sessionDay(game.startedAt) >= filter.from) && (!filter.to || sessionDay(game.startedAt) <= filter.to));
}
export function summarizeSessions(sessions: PlayerSession[]) {
  const persistent = sessions.filter(s => s.game.mode !== "temporary");
  const results = persistent.map(sessionResult).filter((value): value is number => value !== null);
  const wins = results.filter(value => value > 0).length;
  const losses = results.filter(value => value < 0).length;
  const ties = results.filter(value => value === 0).length;
  const balance = results.reduce((sum, value) => sum + value, 0);
  const detailed = persistent.filter(s => !s.game.legacy);
  return { total: persistent.length, settled: results.length, wins, losses, ties,
    winRate: results.length ? wins / results.length * 100 : null, balance,
    average: results.length ? balance / results.length : null,
    best: results.length ? Math.max(...results) : null, worst: results.length ? Math.min(...results) : null,
    invested: detailed.reduce((sum, s) => sum + s.player.movements.reduce((n, m) => n + m.amount, 0), 0),
    rebuys: detailed.reduce((sum, s) => sum + s.player.movements.filter(m => m.type === "rebuy").length, 0),
    averageBuyIns: detailed.length ? detailed.reduce((sum, s) => sum + s.player.movements.length, 0) / detailed.length : null,
  };
}
