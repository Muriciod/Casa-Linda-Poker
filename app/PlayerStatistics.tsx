"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPlayerProfiles, filterSessions, isProfileHidden, normalizePlayerName, sessionResult, summarizeSessions,
  type PlayerProfile, type PlayerSession, type StatisticsFilter, type StatisticsGame, type StatisticsRoster,
} from "../lib/player-statistics";
import "./player-statistics.css";

const modes = ["chips", "cash"] as const;
const filterModes = [...modes, "all"] as const;
const modeName = (mode?: string) => mode === "cash" ? "CASHGAME" : "Fichas";
const amountFormat = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", day: "numeric", month: "short", year: "numeric" });
const nameOrder = new Intl.Collator("es-PY", { sensitivity: "base" });
const money = (value: number) => `${amountFormat.format(Math.round(value))} Gs.`;
const signed = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${money(value)}`;
const tone = (value: number | null) => value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
const rate = (value: number | null) => value === null ? "—" : `${rateFormat.format(value)}%`;
const sessionsLabel = (count: number) => `${count} ${count === 1 ? "sesión" : "sesiones"}`;
const modesFor = (mode: StatisticsFilter["mode"]) => mode === "all" ? modes : [mode];
const isKeyList = (value: unknown): value is string[] => Array.isArray(value) && value.every(key => typeof key === "string");

function ModeBadge({ mode }: { mode?: string }) {
  return <span className={`statistics-mode ${mode === "cash" ? "cash" : ""}`}>{modeName(mode)}</span>;
}

function ProfilePhoto({ profile }: { profile: PlayerProfile }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = profile.roster?.avatarUrl;
  return <span className="profile-photo" aria-hidden="true">
    {url && url !== failedUrl
      ? <img src={url} alt="" width={48} height={48} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
      : profile.name.slice(0, 1).toLocaleUpperCase("es-PY")}
  </span>;
}

function Metrics({ sessions, mode }: { sessions: PlayerSession[]; mode: typeof modes[number] }) {
  const stats = summarizeSessions(sessions);
  return <article className="profile-metrics" aria-label={`Resultados de ${modeName(mode)}`}>
    <div className="profile-rate">
      <div><ModeBadge mode={mode} /><span className="eyebrow profile-rate-label">Win rate</span><strong>{rate(stats.winRate)}</strong></div>
      <span>{sessionsLabel(stats.total)}<br />{stats.settled} con resultado final</span>
    </div>
    {stats.settled > 0 && <div className="profile-outcome-track" aria-hidden="true">
      {stats.wins > 0 && <span className="wins" style={{ flexGrow: stats.wins }} />}
      {stats.losses > 0 && <span className="losses" style={{ flexGrow: stats.losses }} />}
      {stats.ties > 0 && <span className="ties" style={{ flexGrow: stats.ties }} />}
    </div>}
    <div className="profile-outcomes">
      <span><b className="positive">{stats.wins}</b> Ganadas</span>
      <span><b className="negative">{stats.losses}</b> Perdidas</span>
      <span><b>{stats.ties}</b> Empatadas</span>
    </div>
    <dl className="profile-numbers">
      <div><dt>Balance neto</dt><dd className={tone(stats.balance)}>{stats.settled ? signed(stats.balance) : "—"}</dd></div>
      <div><dt>Promedio por sesión</dt><dd className={tone(stats.average)}>{signed(stats.average)}</dd></div>
      <div><dt>Mejor resultado</dt><dd className={tone(stats.best)}>{signed(stats.best)}</dd></div>
      <div><dt>Peor resultado</dt><dd className={tone(stats.worst)}>{signed(stats.worst)}</dd></div>
    </dl>
    {sessions.length > 0 && <details className="profile-extra">
      <summary>Detalle de compras</summary>
      <dl>
        <div><dt>Total invertido registrado</dt><dd>{money(stats.invested)}</dd></div>
        <div><dt>Recompras registradas</dt><dd>{stats.rebuys}</dd></div>
        <div><dt>Compras por sesión, en promedio</dt><dd>{stats.averageBuyIns === null ? "—" : rateFormat.format(stats.averageBuyIns)}</dd></div>
      </dl>
      <p>Solo se incluyen las sesiones con movimientos registrados. El historial importado conserva su resultado neto.</p>
    </details>}
  </article>;
}

function SessionCard({ session, onOpen }: { session: PlayerSession; onOpen: (id: string) => void }) {
  const { game, player } = session;
  const value = sessionResult(session);
  const playedAt = new Date(game.startedAt);
  return <article className="profile-session">
    <div className="profile-session-title">
      <ModeBadge mode={game.mode} />
      {Number.isFinite(playedAt.getTime()) ? <time dateTime={game.startedAt}>{dateFormat.format(playedAt)}</time> : <span className="statistics-session-date">Fecha no disponible</span>}
      <strong>{game.name}</strong>
    </div>
    <dl>
      <div><dt>Ciegas</dt><dd>{game.blinds || "No registradas"}</dd></div>
      <div><dt>Cash-out</dt><dd>{player.cashOut === null ? game.legacy ? "No registrado" : "Pendiente" : money(player.cashOut)}</dd></div>
      <div><dt>Resultado neto</dt><dd className={tone(value)}>{value === null ? game.status === "active" ? "En curso" : "Sin resultado" : signed(value)}</dd></div>
    </dl>
    <button type="button" className="secondary" onClick={() => onOpen(game.id)} aria-label={`${game.status === "active" ? "Abrir partida" : "Ver resumen completo de"} ${game.name}`}>
      {game.status === "active" ? "Abrir partida" : "Ver resumen completo"} <span aria-hidden="true">↗</span>
    </button>
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
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterSelection = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (mutationPending.current) return;
      const read = ++visibilityVersion.current;
      try {
        const response = await fetch("/api/statistics", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("No se pudo cargar la visibilidad de los jugadores.");
        const payload = await response.json();
        if (!isKeyList(payload.hiddenKeys)) throw new Error("No se pudieron leer las estadísticas.");
        if (read === visibilityVersion.current && !controller.signal.aborted) {
          setHiddenKeys(payload.hiddenKeys);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted && read === visibilityVersion.current) {
          setHiddenKeys(null);
          setError(e instanceof Error ? e.message : "No se pudieron cargar las estadísticas.");
        }
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [reload]);

  const profiles = useMemo(() => buildPlayerProfiles(games, roster), [games, roster]);
  const visibility = useMemo(() => hiddenKeys && new Set(profiles.filter(profile => isProfileHidden(profile, hiddenKeys)).map(profile => profile.key)), [profiles, hiddenKeys]);
  const selected = profiles.find(profile => profile.key === selectedKey && visibility !== null && (canEdit || !visibility.has(profile.key)));
  const hidden = Boolean(selected && visibility?.has(selected.key));
  const viewingHidden = canEdit && showHidden;
  const invalidRange = Boolean(filter.from && filter.to && filter.from > filter.to);
  const hasDates = Boolean(filter.from || filter.to);
  const sessions = useMemo(() => selected && !invalidRange ? filterSessions(selected.sessions, filter) : [], [selected, invalidRange, filter]);

  useEffect(() => {
    if (!focusAfterSelection.current) return;
    focusAfterSelection.current = false;
    heading.current?.focus();
  }, [selected?.key]);

  const rankings = useMemo(() => {
    if (!visibility || invalidRange || selected) return [];
    const entries = profiles.flatMap(profile => {
      if (visibility.has(profile.key) !== viewingHidden) return [];
      const matches = filterSessions(profile.sessions, filter);
      if (!matches.length && !viewingHidden && (profile.sessions.length || hasDates || filter.mode === "cash")) return [];
      const summaries = modesFor(filter.mode).map(mode => ({
        mode,
        stats: summarizeSessions(matches.filter(({ game }) => (game.mode || "chips") === mode)),
      }));
      return [{ profile, sessions: matches.length, summaries, rank: 0 }];
    });

    entries.sort((a, b) => {
      const aResult = a.summaries[0].stats;
      const bResult = b.summaries[0].stats;
      const byBalance = !viewingHidden && filter.mode !== "all"
        ? Number(bResult.settled > 0) - Number(aResult.settled > 0) || bResult.balance - aResult.balance
        : 0;
      return byBalance || nameOrder.compare(a.profile.name, b.profile.name);
    });

    let lastBalance: number | undefined;
    let rank = 0;
    if (!viewingHidden && filter.mode !== "all") entries.forEach((entry, index) => {
      const { balance, settled } = entry.summaries[0].stats;
      if (!settled) return;
      if (balance !== lastBalance) rank = index + 1;
      entry.rank = rank;
      lastBalance = balance;
    });
    return entries;
  }, [profiles, visibility, viewingHidden, invalidRange, selected, filter, hasDates]);

  const rows = useMemo(() => {
    const normalized = normalizePlayerName(query);
    if (!normalized) return rankings;
    return rankings.filter(({ profile }) => {
      const containsQuery = (name?: string) => normalizePlayerName(name || "").includes(normalized);
      return containsQuery(profile.name) || containsQuery(profile.roster?.name) || profile.sessions.some(({ player }) => containsQuery(player.name) || containsQuery(player.nickname));
    });
  }, [rankings, query]);

  function selectProfile(key: string | null) {
    focusAfterSelection.current = true;
    setNotice("");
    onSelect(key);
  }

  async function changeVisibility() {
    if (!selected || !canEdit || mutationPending.current) return;
    mutationPending.current = true;
    visibilityVersion.current++;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/statistics", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileKey: selected.key, hidden: !hidden }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isKeyList(payload?.hiddenKeys)) throw new Error(payload?.error || "No se pudo guardar la preferencia.");
      setHiddenKeys(payload.hiddenKeys);
      setShowHidden(!hidden);
      setNotice(hidden ? "Jugador visible nuevamente en estadísticas." : "Jugador oculto de estadísticas. Su historial se conserva.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la preferencia."); }
    finally { mutationPending.current = false; setSaving(false); }
  }

  function resetFilters() {
    setQuery("");
    onFilter({ mode: "all", from: "", to: "" });
  }

  return <section className="player-statistics" aria-labelledby="statistics-title">
    {selected && <button type="button" className="secondary profile-back" onClick={() => selectProfile(null)}>← Todos los jugadores</button>}
    <div className="page-heading">
      <div>
        <div className="eyebrow">Casa Linda · Rendimiento histórico</div>
        <h1 id="statistics-title" ref={heading} tabIndex={-1}>{selected ? selected.name : "Estadísticas"}</h1>
        <p>{selected ? `${sessionsLabel(selected.sessions.length)} en el historial · Fichas y CASHGAME` : "Compará resultados y abrí el historial de cada jugador."}</p>
      </div>
    </div>

    <div className="statistics-filters">
      <div className="statistics-modality">
        <span className="statistics-filter-label">Modalidad</span>
        <div className="archive-tabs" role="group" aria-label="Modalidad de partida">
          {filterModes.map(mode => <button type="button" key={mode} aria-pressed={filter.mode === mode} className={filter.mode === mode ? "selected" : ""} onClick={() => onFilter({ ...filter, mode })}>
            {mode === "all" ? "Ambas" : modeName(mode)}
          </button>)}
        </div>
      </div>
      <details className="statistics-period">
        <summary><span>Rango de fechas</span>{hasDates && <small className="statistics-filter-active">Activo</small>}</summary>
        <div className="statistics-dates">
          <label>Desde<input type="date" value={filter.from} max={filter.to || undefined} onChange={e => onFilter({ ...filter, from: e.currentTarget.value })} /></label>
          <label>Hasta<input type="date" value={filter.to} min={filter.from || undefined} onChange={e => onFilter({ ...filter, to: e.currentTarget.value })} /></label>
          {hasDates && <button type="button" className="secondary" onClick={() => onFilter({ ...filter, from: "", to: "" })}>Limpiar fechas</button>}
        </div>
      </details>
    </div>

    {invalidRange && <p role="alert" className="statistics-error">La fecha inicial debe ser anterior o igual a la fecha final.</p>}
    {error && <div role="alert" className="statistics-error">{error} {hiddenKeys === null && <button type="button" className="secondary" onClick={() => { setError(""); setReload(n => n + 1); }}>Reintentar</button>}</div>}
    {notice && <p role="status" className="statistics-notice">{notice}</p>}

    {hiddenKeys === null ? (!error && <div className="statistics-empty statistics-loading" role="status">
      <span className="statistics-loading-dot" aria-hidden="true" />
      Cargando estadísticas…
    </div>) : selected ? <>
      <div className="profile-identity">
        <ProfilePhoto profile={selected} />
        <div><strong>{selected.roster?.name || selected.name}</strong><span>{hidden ? "Oculto de estadísticas" : "Perfil de jugador"}</span></div>
        {canEdit && selected.roster && <label className="secondary profile-upload">Cambiar foto
          <input type="file" accept="image/*" aria-label={`Cambiar foto de ${selected.name}`} onChange={e => {
            const file = e.currentTarget.files?.[0];
            if (file && selected.roster) onUpload(selected.roster.id, file);
            e.currentTarget.value = "";
          }} />
        </label>}
      </div>
      {!invalidRange && <>
        <div className={`profile-metric-grid ${filter.mode === "all" ? "both" : ""}`}>
          {modesFor(filter.mode).map(mode => <Metrics key={mode} mode={mode} sessions={sessions.filter(s => (s.game.mode || "chips") === mode)} />)}
        </div>
        <details className="statistics-help">
          <summary>¿Cómo se calcula el win rate?</summary>
          <p>Se divide la cantidad de sesiones ganadas por el total de sesiones finalizadas con resultado. Los empates cuentan en el total. Las sesiones en curso y las temporales quedan fuera. Fechas de Paraguay.</p>
        </details>
      </>}
      {canEdit && <div className="profile-visibility">
        <div><strong>Visibilidad en estadísticas</strong><p>{hidden ? "Seguirá oculto aunque participe en nuevas partidas." : "Podés quitarlo de los rankings y listas de estadísticas sin borrar su historial."}</p></div>
        <button type="button" className="secondary" disabled={saving} onClick={changeVisibility}>
          {saving ? "Guardando…" : hidden ? "Mostrar nuevamente en estadísticas" : "Ocultar de estadísticas"}
        </button>
      </div>}
      {!invalidRange && <>
        <div className="profile-session-heading"><h2>Sesiones del jugador</h2><span>{sessionsLabel(sessions.length)} con estos filtros</span></div>
        {!sessions.length ? <div className="statistics-empty"><strong>Sin sesiones en esta vista</strong><p>Probá otra modalidad o ampliá el rango de fechas.</p></div> :
          <div className="profile-sessions">{sessions.map(session => <SessionCard key={`${session.game.id}:${session.player.id}`} session={session} onOpen={onOpen} />)}</div>}
      </>}
    </> : <>
      <div className="statistics-toolbar">
        <label className="statistics-search">Buscar jugador
          <input type="search" placeholder="Nombre o apodo" value={query} onChange={e => setQuery(e.currentTarget.value)} />
        </label>
        {canEdit && <div className="archive-tabs" role="group" aria-label="Visibilidad de jugadores">
          <button type="button" className={!viewingHidden ? "selected" : ""} aria-pressed={!viewingHidden} onClick={() => setShowHidden(false)}>Visibles</button>
          <button type="button" className={viewingHidden ? "selected" : ""} aria-pressed={viewingHidden} onClick={() => setShowHidden(true)}>Ocultos ({visibility?.size ?? 0})</button>
        </div>}
      </div>
      {!invalidRange && <>
        <div className="statistics-list-heading">
          <h2>{viewingHidden ? "Jugadores ocultos" : filter.mode === "all" ? "Jugadores" : `Ranking de ${modeName(filter.mode)}`}</h2>
          <span role="status">{rows.length} {rows.length === 1 ? "jugador" : "jugadores"}</span>
        </div>
        <p className="statistics-explainer">{viewingHidden ? "Abrí un perfil para volver a mostrarlo. Su historial se conserva." : filter.mode === "all" ? "Orden alfabético. Fichas y CASHGAME conservan balances y win rates separados." : "Ordenado por balance neto. Solo se asigna un puesto a quienes tienen resultados finalizados."}</p>
        {!rows.length ? <div className="statistics-empty">
          <strong>{viewingHidden ? "No se encontraron jugadores ocultos" : "No se encontraron jugadores"}</strong>
          <p>{query ? "Probá otro nombre o apodo." : viewingHidden ? "Los perfiles que ocultes aparecerán acá." : "Cambiá la modalidad o el rango de fechas para ampliar la búsqueda."}</p>
          {(query || hasDates || (!viewingHidden && filter.mode !== "all")) && <button type="button" className="secondary" onClick={resetFilters}>Limpiar filtros</button>}
        </div> : <ul className="statistics-player-grid" role="list">
          {rows.map(({ profile, sessions: count, summaries, rank }) => <li key={profile.key}>
            <button type="button" className="statistics-player-card" onClick={() => selectProfile(profile.key)} aria-label={`Ver perfil y sesiones de ${profile.name}. ${sessionsLabel(count)}.${viewingHidden ? " Oculto." : rank > 0 ? ` Puesto ${rank}.` : ""} ${summaries.map(({ mode, stats }) => `${modeName(mode)}: ${stats.settled ? `balance neto ${signed(stats.balance)}, win rate ${rate(stats.winRate)}` : "sin resultados finalizados"}.`).join(" ")}`}>
              <div className="statistics-card-name">
                <ProfilePhoto profile={profile} />
                <span><strong>{profile.name}</strong><small>{sessionsLabel(count)}</small></span>
                {(viewingHidden || rank > 0) && <span className={`statistics-position ${rank === 1 ? "is-leading" : ""}`}>{viewingHidden ? "Oculto" : `#${rank}`}</span>}
              </div>
              {summaries.map(({ mode, stats }) => <div className="statistics-card-result" key={mode}>
                <span><ModeBadge mode={mode} /><strong className={tone(stats.balance)}>{stats.settled ? signed(stats.balance) : "—"}</strong></span>
                <span>Win rate<strong>{rate(stats.winRate)}</strong></span>
              </div>)}
              <span className="statistics-card-link">Ver perfil y sesiones <b aria-hidden="true">→</b></span>
            </button>
          </li>)}
        </ul>}
      </>}
    </>}
  </section>;
}
