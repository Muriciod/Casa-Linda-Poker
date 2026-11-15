// Owner-requested repair: the accidental CASHGAME 11 seat was already reassigned
// to Max. Keep the unused roster row for recovery; restore unambiguous legacy-name
// matching to the original Mauri without changing any game or financial record.
export const retireUnusedMauriDuplicate = `UPDATE poker_roster SET active = 0
 WHERE id = 'mauri-4efa1695' AND name = 'Mauri' AND active = 1
 AND created_at = '2026-11-14 05:11:16'
 AND EXISTS (SELECT 1 FROM poker_roster WHERE id = 'jugador-mauri' AND name = 'Mauri' AND active = 1)
 AND NOT EXISTS (SELECT 1 FROM poker_games, json_each(poker_games.data, '$.players') p WHERE json_extract(p.value, '$.id') = 'mauri-4efa1695')
 AND NOT EXISTS (SELECT 1 FROM poker_cash_games, json_each(poker_cash_games.data, '$.players') p WHERE json_extract(p.value, '$.id') = 'mauri-4efa1695')`;
