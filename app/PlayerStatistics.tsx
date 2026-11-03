"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPlayerProfiles, filterSessions, isProfileHidden, normalizePlayerName, sessionResult, summarizeSessions, type PlayerSession, type StatisticsFilter, type StatisticsGame, type StatisticsRoster } from "../lib/player-statistics";

const money = (value: number) => `${Math.round(value).toLocaleString("es-PY")} Gs.`;
const signed = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${money(value)}`;
const tone = (value: number | null) => value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
const rate = (value: number | null) => value === null ? "—" : `${value.toLocaleString("es-PY", { maximumFractionDigits: 1 })}%`;
const modeName = (mode?: string) => mode === "cash" ? "CASHGAME" : "Fichas";
const date = (value: string) => new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

function Metrics({ sessions, label }: { sessions: PlayerSession[]; label: string }) {
  const stats = summarizeSessions(sessions);
  return <article className="profile-metrics">
    <div className="profile-rate"><div><span className="eyebrow">{label} · Win rate</span><strong>{rate(stats.winRate)}</strong></div><span>{stats.total} sesiones<br />{stats.settled} con resultado final</span></div>
    <div className="profile-outcomes"><span><b className="positive">{stats.wins}</b> Ganadas</span><span><b className="negative">{stats.losses}</b> Perdidas</span><span><b>{stats.ties}</b> Empatadas</span></div>
    <dl className="profile-numbers"><div><dt>Ganancia / pérdida total</dt><dd className={tone(stats.balance)}>{stats.settled ? signed(stats.balance) : "—"}</dd></div><div><dt>Promedio por sesión</dt><dd className={tone(stats.average)}>{signed(stats.average)}</dd></div><div><dt>Mejor resultado</dt><dd className={tone(stats.best)}>{signed(stats.best)}</dd></div><div><dt>Peor resultado</dt><dd className={tone(stats.worst)}>{signed(stats.worst)}</dd></div></dl>
    <details className="profile-extra"><summary>Detalle de compras</summary><dl><div><dt>Total invertido registrado</dt><dd>{money(stats.invested)}</dd></div><div><dt>Recompras registradas</dt><dd>{stats.rebuys}</dd></div><div><dt>Promedio de compras por sesión</dt><dd>{stats.averageBuyIns?.toFixed(1) ?? "—"}</dd></div></dl><p>Solo sesiones con detalle de movimientos. El historial importado conserva su resultado neto.</p></details>
  </article>;
}

export default function PlayerStatistics({ games, roster, canEdit, onUpload, onOpen, selectedKey, onSelect, filter, onFilter }: {
  games: StatisticsGame[]; roster: StatisticsRoster[]; canEdit: boolean;
  onUpload: (id: string, photo: File) => void; onOpen: (id: string) => void;
  selectedKey: string | null; onSelect: (key: string | null) => void;
  filter: StatisticsFilter; onFilter: (filter: StatisticsFilter) => void;
}) {
  const [hiddenKeys, setHiddenKeys] = useState<string[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const visibilityVersion = useRef(0);
  const mutationPending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (mutationPending.current) return;
      const read = ++visibilityVersion.current;
      try {
        const response = await fetch("/api/statistics", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("No se pudo cargar la visibilidad. Reintentá para ver las estadísticas.");
        const payload = await response.json();
        if (!Array.isArray(payload.hiddenKeys)) throw new Error("La respuesta de estadísticas no es válida.");
        if (read === visibilityVersion.current && !controller.signal.aborted) { setHiddenKeys(payload.hiddenKeys); setError(""); }
      } catch (e) { if (!controller.signal.aborted && read === visibilityVersion.current) { setHiddenKeys(null); setError(e instanceof Error ? e.message : "No se pudieron cargar las estadísticas."); } }
    }
    void load();
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [reload]);
  const profiles = useMemo(() => buildPlayerProfiles(games, roster), [games, roster]);
  const selected = profiles.find(profile => profile.key === selectedKey && hiddenKeys !== null && (canEdit || !isProfileHidden(profile, hiddenKeys)));
  const hidden = selected && hiddenKeys ? isProfileHidden(selected, hiddenKeys) : false;
  const invalidRange = Boolean(filter.from && filter.to && filter.from > filter.to);
  const sessions = selected && !invalidRange ? filterSessions(selected.sessions, filter) : [];
  const rows = profiles.filter(profile => hiddenKeys && isProfileHidden(profile, hiddenKeys) === (canEdit && showHidden))
    .filter(profile => [profile.name, profile.roster?.name || "", ...profile.sessions.flatMap(s => [s.player.name, s.player.nickname || ""])].some(name => normalizePlayerName(name).includes(normalizePlayerName(query))))
    .map(profile => ({ profile, sessions: invalidRange ? [] : filterSessions(profile.sessions, filter) }))
    .filter(row => row.sessions.length || (canEdit && showHidden) || (!row.profile.sessions.length && !filter.from && !filter.to && filter.mode !== "cash"))
    .sort((a, b) => filter.mode === "all" ? a.profile.name.localeCompare(b.profile.name) : summarizeSessions(b.sessions).balance - summarizeSessions(a.sessions).balance || a.profile.name.localeCompare(b.profile.name));
  const hiddenCount = profiles.filter(profile => hiddenKeys && isProfileHidden(profile, hiddenKeys)).length;
  async function changeVisibility() {
    if (!selected || !canEdit || saving) return;
    mutationPending.current = true; visibilityVersion.current++;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/statistics", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileKey: selected.key, hidden: !hidden }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar la preferencia.");
      setHiddenKeys(payload.hiddenKeys);
      setShowHidden(!hidden);
      setNotice(hidden ? "Jugador visible nuevamente en estadísticas." : "Jugador oculto de estadísticas. Su historial se conserva.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { mutationPending.current = false; setSaving(false); }
  }
  const filters = <div className="statistics-filters">
    <div className="archive-tabs" role="group" aria-label="Tipo de estadísticas">{(["chips", "cash", "all"] as const).map(mode => <button key={mode} aria-pressed={filter.mode === mode} className={filter.mode === mode ? "selected" : ""} onClick={() => onFilter({ ...filter, mode })}>{mode === "all" ? "Ambas" : modeName(mode)}</button>)}</div>
    <div className="statistics-dates"><label>Desde<input type="date" value={filter.from} max={filter.to || undefined} onInput={e => onFilter({ ...filter, from: e.currentTarget.value })} onChange={e => onFilter({ ...filter, from: e.target.value })} /></label><label>Hasta<input type="date" value={filter.to} min={filter.from || undefined} onInput={e => onFilter({ ...filter, to: e.currentTarget.value })} onChange={e => onFilter({ ...filter, to: e.target.value })} /></label>{(filter.from || filter.to) && <button className="secondary" onClick={() => onFilter({ ...filter, from: "", to: "" })}>Limpiar fechas</button>}</div>
  </div>;
  return <section className="player-statistics">
    {selected && <button className="secondary profile-back" onClick={() => { onSelect(null); setNotice(""); }}>← Todos los jugadores</button>}
    <div className="page-heading"><div><div className="eyebrow">Casa Linda · Rendimiento histórico</div><h1>{selected ? selected.name : "Estadísticas"}</h1><p>{selected ? `${selected.sessions.length} sesiones en su historial · Fichas y CASHGAME` : "Cada jugador, cada sesión, cada resultado."}</p></div></div>
    {filters}
    {invalidRange && <p role="alert" className="statistics-error">La fecha inicial debe ser anterior o igual a la fecha final.</p>}
    {error && <div role="alert" className="statistics-error">{error} {hiddenKeys === null && <button className="secondary" onClick={() => setReload(n => n + 1)}>Reintentar</button>}</div>}
    {notice && <p role="status" className="statistics-notice">{notice}</p>}
    {hiddenKeys === null ? (!error && <p role="status">Cargando estadísticas…</p>) : selected && (!hidden || canEdit) ? <>
      <div className="profile-identity"><span className="profile-photo">{selected.roster?.avatarUrl ? <img src={selected.roster.avatarUrl} alt={`Foto de ${selected.name}`} /> : selected.name.slice(0, 1)}</span><div><strong>{selected.roster?.name || selected.name}</strong><span>{hidden ? "Oculto de estadísticas" : "Perfil de jugador"}</span></div>{canEdit && selected.roster && <label className="secondary profile-upload">Cambiar foto<input type="file" accept="image/*" aria-label={`Cambiar foto de ${selected.name}`} onChange={e => { const file = e.target.files?.[0]; if (file && selected.roster) onUpload(selected.roster.id, file); e.currentTarget.value = ""; }} /></label>}</div>
      <div className={`profile-metric-grid ${filter.mode === "all" ? "both" : ""}`}>{(filter.mode === "all" ? ["chips", "cash"] : [filter.mode]).map(mode => <Metrics key={mode} label={modeName(mode)} sessions={sessions.filter(s => (s.game.mode || "chips") === mode)} />)}</div>
      <p className="statistics-explainer">Win rate = sesiones ganadas ÷ sesiones finalizadas con resultado × 100. Los empates cuentan en el total, pero no son victorias ni derrotas. Las sesiones en curso y las temporales no cuentan. Fechas de Paraguay.</p>
      {canEdit && <div className="profile-visibility"><div><strong>Visibilidad en estadísticas</strong><p>{hidden ? "Seguirá oculto aunque participe en nuevas partidas." : "Ocultarlo lo quita de las listas y rankings de estadísticas, sin borrar su historial."}</p></div><button className="secondary" disabled={saving} onClick={changeVisibility}>{saving ? "Guardando…" : hidden ? "Mostrar nuevamente en estadísticas" : "Ocultar de estadísticas"}</button></div>}
      <div className="profile-session-heading"><h2>Sesiones del jugador</h2><span>{sessions.length} con estos filtros</span></div>
      {!sessions.length && <div className="statistics-empty">No hay sesiones para estos filtros.</div>}
      <div className="profile-sessions">{sessions.map(({ game, player }) => { const value = sessionResult({ game, player }); return <article className="profile-session" key={`${game.id}:${player.id}`}><div className="profile-session-title"><span className={`statistics-mode ${game.mode === "cash" ? "cash" : ""}`}>{modeName(game.mode)}</span><time dateTime={game.startedAt}>{date(game.startedAt)}</time><strong>{game.name}</strong></div><dl><div><dt>Blinds</dt><dd>{game.blinds || "No registradas"}</dd></div><div><dt>Terminó con · cash-out</dt><dd>{player.cashOut === null ? game.legacy ? "No registrado" : "Pendiente" : money(player.cashOut)}</dd></div><div><dt>Ganancia / pérdida</dt><dd className={tone(value)}>{value === null ? game.status === "active" ? "En curso" : "Sin resultado" : signed(value)}</dd></div></dl><button className="secondary" onClick={() => onOpen(game.id)}>{game.status === "active" ? "Abrir partida" : "Ver resumen completo"} ↗</button></article>; })}</div>
    </> : <>
      <div className="statistics-toolbar"><label className="statistics-search">Buscar jugador<input type="search" placeholder="Nombre o apodo" value={query} onChange={e => setQuery(e.target.value)} /></label>{canEdit && <div className="archive-tabs" role="group" aria-label="Visibilidad de jugadores"><button className={!showHidden ? "selected" : ""} aria-pressed={!showHidden} onClick={() => setShowHidden(false)}>Visibles</button><button className={showHidden ? "selected" : ""} aria-pressed={showHidden} onClick={() => setShowHidden(true)}>Ocultos ({hiddenCount})</button></div>}</div>
      <p className="statistics-explainer">{showHidden && canEdit ? "Estos jugadores conservan sus datos. Abrí un perfil para volver a mostrarlo." : filter.mode === "all" ? "Vista conjunta por nombre. Cada modalidad conserva su balance y win rate separados." : "Ranking por resultado neto de sesiones finalizadas. Tocá un jugador para abrir su perfil."}</p>
      {!rows.length && <div className="statistics-empty">{showHidden ? "No hay jugadores ocultos que coincidan con la búsqueda." : "No hay jugadores para estos filtros."}</div>}
      <div className="statistics-player-grid">{!invalidRange && rows.map(({ profile, sessions: playerSessions }, index) => <button className="statistics-player-card" key={profile.key} onClick={() => onSelect(profile.key)} aria-label={`Ver perfil de ${profile.name}`}><div className="statistics-card-name"><span className="profile-photo">{profile.roster?.avatarUrl ? <img src={profile.roster.avatarUrl} alt="" /> : profile.name.slice(0, 1)}</span><span><strong>{profile.name}</strong><small>{playerSessions.length} sesiones</small></span><span className="statistics-position">{showHidden ? "Oculto" : filter.mode === "all" ? "↗" : `#${index + 1}`}</span></div>{(filter.mode === "all" ? ["chips", "cash"] : [filter.mode]).map(mode => { const stats = summarizeSessions(playerSessions.filter(s => (s.game.mode || "chips") === mode)); return <div className="statistics-card-result" key={mode}><span>{modeName(mode)}<strong className={tone(stats.balance)}>{stats.settled ? signed(stats.balance) : "—"}</strong></span><span>Win rate<strong>{rate(stats.winRate)}</strong></span></div>; })}<span className="statistics-card-link">Ver perfil y sesiones <b>→</b></span></button>)}</div>
    </>}
  </section>;
}
