type Identity = { id: string; name: string; nickname?: string };
type Mode = "chips" | "cash" | "temporary";
type Session = { mode?: Mode; players: readonly Identity[] };

// Keep the three matching channels distinct: ID, display name, and real name.
// A meeting of names may match several roster entries, but each can count a
// particular game only once, even if it contains repeated or historical seats.
export function rosterCountsForMode(roster: readonly Identity[], games: readonly Session[],
  mode: Mode | undefined, normalize: (value: string) => string): Map<string, number> {
  const counts = new Map<string, number>();
  if (mode === "temporary" || !roster.length) return counts;
  const byName = new Map<string, string[]>(), byDisplay = new Map<string, string[]>();
  function index(map: Map<string, string[]>, name: string, id: string) {
    const bucket = map.get(name);
    if (bucket) bucket.push(id);
    else map.set(name, [id]);
  }
  // The old Map keyed by ID uses the last entry if a source contains repeated IDs.
  const entries = new Map(roster.map(entry => [entry.id, entry]));
  for (const entry of entries.values()) {
    const name = normalize(entry.name);
    counts.set(entry.id, 0);
    index(byName, name, entry.id);
    index(byDisplay, entry.nickname ? normalize(entry.nickname) : name, entry.id);
  }
  for (const game of games) {
    if ((game.mode || "chips") !== (mode || "chips")) continue;
    const matched = new Set<string>();
    for (const player of game.players) {
      if (counts.has(player.id)) matched.add(player.id);
      const name = normalize(player.name);
      const aliases = byDisplay.get(player.nickname ? normalize(player.nickname) : name);
      const names = byName.get(name);
      if (names) for (const id of names) matched.add(id);
      if (aliases) for (const id of aliases) matched.add(id);
    }
    for (const id of matched) counts.set(id, counts.get(id)! + 1);
  }
  return counts;
}
