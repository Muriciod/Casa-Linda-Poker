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

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" });
const gameDays = new WeakMap<StatisticsGame, { startedAt: string; day: string }>();
export function sessionDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = dayFormatter.formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function filterSessions(sessions: PlayerSession[], filter: StatisticsFilter) {
  const { mode, from, to } = filter;
  return sessions.filter(({ game }) => {
    if (game.mode === "temporary" || (mode !== "all" && (game.mode || "chips") !== mode)) return false;
    if (!from && !to) return true;
    let entry = gameDays.get(game);
    if (!entry || entry.startedAt !== game.startedAt) {
      entry = { startedAt: game.startedAt, day: sessionDay(game.startedAt) };
      gameDays.set(game, entry);
    }
    const { day } = entry;
    return Boolean(day && (!from || day >= from) && (!to || day <= to));
  });
}
export function summarizeSessions(sessions: PlayerSession[]) {
  let total = 0, settled = 0, wins = 0, losses = 0, ties = 0, balance = 0;
  let best: number | null = null, worst: number | null = null;
  let detailed = 0, invested = 0, rebuys = 0, purchases = 0;
  for (const session of sessions) {
    if (session.game.mode === "temporary") continue;
    total++;
    const net = sessionResult(session);
    if (net !== null) {
      settled++;
      if (net > 0) wins++;
      else if (net < 0) losses++;
      else if (net === 0) ties++;
      balance += net;
      best = best === null ? net : Math.max(best, net);
      worst = worst === null ? net : Math.min(worst, net);
    }
    if (session.game.legacy) continue;
    detailed++;
    let sessionInvestment = 0;
    for (const movement of session.player.movements) {
      sessionInvestment += movement.amount;
      if (movement.type === "rebuy") rebuys++;
      purchases++;
    }
    invested += sessionInvestment;
  }
  return { total, settled, wins, losses, ties,
    winRate: settled ? wins / settled * 100 : null, balance,
    average: settled ? balance / settled : null,
    best, worst, invested, rebuys,
    averageBuyIns: detailed ? purchases / detailed : null,
  };
}
