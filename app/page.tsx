"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import PlayerStatistics from "./PlayerStatistics";
import StakeFields from "./StakeFields";
import { calculateGameStakes, type EntryCurrency, type BuyInBB } from "../lib/game-stakes";
import type { StatisticsFilter } from "../lib/player-statistics";

type MovementType = "buyin" | "rebuy";
type GameMode = "chips" | "cash" | "temporary";
const modeLabels = { chips: "Fichas", cash: "CASHGAME · real", temporary: "Temporal · sin historial" };
type GameStatus = "active" | "finalized";
type View = "home" | "live" | "cashout" | "history" | "stats" | "summary";
type AccessMode = "entry" | "viewer" | "admin";
type ModalName = "new-game" | "add-player" | "amount" | "edit-movement" | "close-warning" | "login" | "setup" | "settings" | "delete-game" | "change-mode" | null;

type Movement = { id: string; type: MovementType; amount: number; createdAt: string };
type Player = { id: string; name: string; nickname?: string; avatar: string; movements: Movement[]; cashOut: number | null; legacyResult?: number };
type Game = {
  inputCurrency?: EntryCurrency; inputBuyIn?: number; exchangeRate?: number; buyInBB?: BuyInBB; smallBlind?: number; bigBlind?: number;
  mode?: GameMode; id: string; name: string; currency: "PYG"; standardBuyIn: number; startingChips: number; blinds: string; notes: string;
  startedAt: string; endedAt: string | null; status: GameStatus; players: Player[]; legacy?: boolean; sheetColumn?: number | null;
};
type RosterEntry = { id: string; name: string; nickname?: string; kind: "permanente" | "temporal"; active?: number | boolean; avatarKey?: string; avatarUrl?: string; createdAt?: string };
type UndoAction = { gameId: string; playerId: string; movement: Movement } | null;

const makeMovement = (id: string, type: MovementType, amount: number, createdAt: string): Movement => ({ id, type, amount, createdAt });
const emptyGame: Game = { id: "empty", name: "Sin partidas", currency: "PYG", standardBuyIn: 0, startingChips: 0, blinds: "", notes: "", startedAt: "1970-01-01T00:00:00Z", endedAt: null, status: "finalized", players: [] };
const validAmount = (amount: number, minimum = 1) => Number.isSafeInteger(amount) && amount >= minimum;

const money = (value: number) => `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} Gs.`;
const compactMoney = (value: number) => value < 1000 ? money(value) : value >= 1000000 ? `${(value / 1000000).toFixed(value % 1000000 ? 1 : 0).replace(".", ",")} M Gs.` : `${Math.round(value / 1000)} k Gs.`;
const sessionDateFormat = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" });
const dateParts = (value: string) => Object.fromEntries(sessionDateFormat.formatToParts(new Date(value)).map((part) => [part.type, part.value.replace(/[\u00a0\u202f]/g, " ")]));
const time = (value: string) => { const parts = dateParts(value); return `${parts.hour}:${parts.minute}${parts.dayPeriod ? ` ${parts.dayPeriod}` : ""}`; };
const dateTime = (value: string) => { const parts = dateParts(value); return `${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}${parts.dayPeriod ? ` ${parts.dayPeriod}` : ""}`; };
const invested = (player: Player) => player.movements.reduce((sum, movement) => sum + movement.amount, 0);
const result = (player: Player) => typeof player.legacyResult === "number" ? player.legacyResult : (player.cashOut ?? 0) - invested(player);
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const fixText = (value: string) => String(value ?? "")
  .replaceAll("Ã¡", "á").replaceAll("Ã©", "é").replaceAll("Ã­", "í").replaceAll("Ã³", "ó")
  .replaceAll("Ãº", "ú").replaceAll("Ã±", "ñ").replaceAll("Ã", "Á").replaceAll("Ã‰", "É")
  .replaceAll("Ã", "Í").replaceAll("Ã“", "Ó").replaceAll("Ãš", "Ú").replaceAll("Ã‘", "Ñ").replaceAll("Â", "");
const normalizedName = (value: string) => fixText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const buyInLabel = (value: number) => value >= 1000000
  ? `${(value / 1000000).toFixed(value % 1000000 ? 1 : 0).replace(".", ",")}M`
  : value >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value));
const cleanGame = (game: Game): Game => ({
  ...game,
  name: fixText(game.name),
  blinds: fixText(game.blinds || "5.000 / 10.000"),
  notes: fixText(game.notes),
  startingChips: Number(game.startingChips || 0),
  players: (game.players ?? []).map((player) => ({ ...player, name: fixText(player.name), nickname: fixText(player.nickname ?? ""), avatar: player.avatar || fixText(player.nickname || player.name).slice(0, 1).toUpperCase() })),
});
const cleanRosterEntry = (player: RosterEntry): RosterEntry => ({ ...player, name: fixText(player.name), nickname: fixText(player.nickname ?? "") });
const rosterMatchesPlayer = (entry: RosterEntry, player: Player) => entry.id === player.id
  || normalizedName(entry.nickname || entry.name) === normalizedName(player.nickname || player.name)
  || normalizedName(entry.name) === normalizedName(player.name);

async function optimizeProfilePhoto(photo: File) {
  const objectUrl = URL.createObjectURL(photo);
  try {
    const image = document.createElement("img");
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("No se pudo leer la imagen")); });

    const render = (maxSide: number, quality: number) => new Promise<Blob>((resolve, reject) => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("No se pudo preparar la imagen"));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen")), "image/webp", quality);
    });

    let optimized = await render(720, 0.82);
    if (optimized.size > 820 * 1024) optimized = await render(560, 0.7);
    if (optimized.size > 820 * 1024) optimized = await render(420, 0.58);
    return new File([optimized], `perfil-${Date.now()}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function duration(startedAt: string, endedAt?: string | null) {
  const totalMinutes = Math.max(0, Math.floor((new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 60000));
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

function AppIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h5v-5h4v5h5V9"/></>,
    cashout: <><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18m-6 5h3"/></>,
    history: <><path d="M3 12a9 9 0 1 1 2.6 6.4M3 7v5h5"/><path d="M12 7v5l3 2"/></>,
    stats: <><path d="M4 4v16h16M8 15l4-4 3 2 5-6"/><path d="M16 7h4v4"/></>,
    search: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></>,
    clock: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V8a4 4 0 0 1 8 0v2m-4 4v2"/></>,
    exit: <><path d="M10 4H5v16h5m4-12 4 4-4 4m-5-4h9"/></>,
    add: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    undo: <path d="M8 5 3 10l5 5M3 10h12a5 5 0 0 1 0 10h-3"/>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></>,
    download: <path d="M12 4v11m-4-4 4 4 4-4M5 17v3h14v-3"/>,
    share: <path d="M14 5h5v5m0-5-9 9m2-7H5v13h13v-7"/>,
  };
  if (paths[name]) return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", flexShrink: 0 }}>{paths[name]}</svg>;
  const suits: Record<string, string> = { live: "♠", menu: "•••", trophy: "♛", players: "♣", settings: "⚙" };
  return <span aria-hidden="true">{suits[name] ?? "•"}</span>;
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [activeGameId, setActiveGameId] = useState("");
  const [view, setView] = useState<View>("home");
  const [accessMode, setAccessMode] = useState<AccessMode>("entry");
  const [auth, setAuth] = useState({ authenticated: false, username: "", setupRequired: false });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("inversion");
  const [menuPlayerId, setMenuPlayerId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "pending">("saved");
  const [loaded, setLoaded] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const addingPlayerRef = useRef(false);
  const [deletingGame, setDeletingGame] = useState(false);
  const deletingIds = useRef(new Set<string>());
  const savedGames = useRef(new Map<string, Game>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [amountTarget, setAmountTarget] = useState<{ playerId: string; type: MovementType } | null>(null);
  const [editingMovement, setEditingMovement] = useState<{ playerId: string; movement: Movement } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null);
  const [customAmount, setCustomAmount] = useState(500000);
  const [newGameMode, setNewGameMode] = useState<GameMode>("chips");
  const [targetGameMode, setTargetGameMode] = useState<GameMode>("chips");
  const [changingMode, setChangingMode] = useState(false);
  const changingModeRef = useRef(false);
  const saveInFlight = useRef<Promise<void>>(Promise.resolve());
  const [statsSelectedKey, setStatsSelectedKey] = useState<string | null>(null);
  const [statsFilter, setStatsFilter] = useState<StatisticsFilter>({ mode: "chips", from: "", to: "" });
  const [returnToStats, setReturnToStats] = useState(false);
  const [archiveMode, setArchiveMode] = useState<"chips" | "cash">("chips");
  const [newGameBuyIn, setNewGameBuyIn] = useState("500000");
  const [newGameCurrency, setNewGameCurrency] = useState<EntryCurrency>("PYG");
  const [newGameBuyInBB, setNewGameBuyInBB] = useState<BuyInBB>(100);
  const [newGameName, setNewGameName] = useState("");
  const [newGameNameEdited, setNewGameNameEdited] = useState(false);
  const [playerChoice, setPlayerChoice] = useState("__new");
  const [rosterSearch, setRosterSearch] = useState("");
  const [playerKind, setPlayerKind] = useState<"temporal" | "permanente">("temporal");
  const [settings, setSettings] = useState({ connected: false, bridgeUrl: "" });
  const [formError, setFormError] = useState("");
  const [, setTick] = useState(0);

  const archiveGames = useMemo(() => games.filter((game) => (game.mode || "chips") === archiveMode), [games, archiveMode]);
  const archivedGames = useMemo(() => archiveGames.filter((game) => normalizedName(game.name).includes(normalizedName(historySearch))), [archiveGames, historySearch]);
  const selectedGame = games.find((game) => game.id === activeGameId);
  const liveGame = selectedGame?.status === "active" ? selectedGame : games.find((game) => game.status === "active");
  const activeGame = (view === "summary" ? selectedGame : liveGame) ?? emptyGame;
  const savedSessions = useMemo(() => games.filter((game) => game.mode !== "temporary" && game.status === "finalized"), [games]);
  const temporaryGames = useMemo(() => games.filter((game) => game.mode === "temporary"), [games]);
  const pendingCashOuts = activeGame.players.filter((player) => player.cashOut === null).length;
  const canEdit = accessMode === "admin" && auth.authenticated;

  const loadData = async () => {
    setDataError(false);
    try {
      const [authResponse, gamesResponse, rosterResponse] = await Promise.all([fetch("/api/auth"), fetch("/api/games"), fetch("/api/roster")]);
      if (authResponse.ok) {
        const payload = await authResponse.json() as { authenticated?: boolean; username?: string; setupRequired?: boolean };
        setAuth({ authenticated: Boolean(payload.authenticated), username: payload.username ?? "", setupRequired: Boolean(payload.setupRequired) });
      }
      if (gamesResponse.ok) {
        const payload = await gamesResponse.json() as { games?: Game[] };
        const cleanedGames = (payload.games ?? []).map(cleanGame);
        savedGames.current = new Map(cleanedGames.map((game) => [game.id, game]));
        setGames((current) => [...current.filter((game) => game.mode === "temporary"), ...cleanedGames]);
        setActiveGameId((current) => current || cleanedGames.find((game) => game.status === "active")?.id || "");
      }
      if (rosterResponse.ok) {
        const payload = await rosterResponse.json() as { roster?: RosterEntry[] };
        setRoster((payload.roster ?? []).map(cleanRosterEntry));
      }
      setDataError(!authResponse.ok || !gamesResponse.ok || !rosterResponse.ok);
    } catch {
      setDataError(true);
    } finally { setLoaded(true); }
  };

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 60000);
    const kickoff = window.setTimeout(() => {
      void loadData();
      const setupToken = new URLSearchParams(window.location.search).get("setup");
      if (setupToken) setModal("setup");
    }, 0);
    return () => { window.clearInterval(interval); window.clearTimeout(kickoff); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const persistGames = (snapshot: Game[]) => {
    const task = saveInFlight.current.catch(() => undefined).then(async () => {
      const changed = snapshot.filter((game) => game.mode !== "temporary" && !deletingIds.current.has(game.id) && savedGames.current.get(game.id) !== game);
      if (!changed.length) return;
      setSaveState("saving");
      const response = await fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ games: changed }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "No se pudieron guardar los últimos cambios");
      }
      changed.forEach((game) => savedGames.current.set(game.id, game));
      setSaveState("saved");
    }).catch((error) => { setSaveState("pending"); throw error; });
    saveInFlight.current = task;
    return task;
  };

  useEffect(() => {
    if (!loaded || !canEdit || changingMode || deletingGame) return;
    const timeout = window.setTimeout(() => {
      if (!changingModeRef.current) persistGames(games).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [games, loaded, canEdit, changingMode, deletingGame]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [view, accessMode]);

  const totals = useMemo(() => {
    const movements = activeGame.players.flatMap((player) => player.movements);
    return {
      players: activeGame.players.length,
      buyIns: movements.filter((movement) => movement.type === "buyin").length,
      rebuys: movements.filter((movement) => movement.type === "rebuy").length,
      entered: movements.reduce((sum, movement) => sum + movement.amount, 0),
      cashOuts: activeGame.players.reduce((sum, player) => sum + (player.cashOut ?? 0), 0),
    };
  }, [activeGame]);

  const sortedPlayers = useMemo(() => [...activeGame.players]
    .filter((player) => normalizedName(`${player.name} ${player.nickname ?? ""}`).includes(normalizedName(search)))
    .sort((a, b) => sortBy === "nombre" ? a.name.localeCompare(b.name) : sortBy === "menor" ? invested(a) - invested(b) : sortBy === "recompras" ? b.movements.filter((m) => m.type === "rebuy").length - a.movements.filter((m) => m.type === "rebuy").length : invested(b) - invested(a)), [activeGame.players, search, sortBy]);

  const recentMovements = useMemo(() => activeGame.players.flatMap((player) => player.movements.map((movement) => ({ ...movement, playerName: player.nickname || player.name }))).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5), [activeGame.players]);
  const rosterSessionCounts = useMemo(() => modal !== "add-player" || activeGame.mode === "temporary" ? new Map<string, number>() : new Map(roster.map((entry) => [entry.id, games.filter((game) => (game.mode || "chips") === (activeGame.mode || "chips")).reduce((total, game) => total + (game.players.some((player) => rosterMatchesPlayer(entry, player)) ? 1 : 0), 0)])), [games, roster, activeGame.mode, modal]);
  const availableRoster = useMemo(() => (activeGame.mode === "temporary" ? [] : roster)
    .filter((entry) => !activeGame.players.some((player) => rosterMatchesPlayer(entry, player)))
    .sort((a, b) => (rosterSessionCounts.get(b.id) ?? 0) - (rosterSessionCounts.get(a.id) ?? 0) || (a.nickname || a.name).localeCompare(b.nickname || b.name)), [activeGame.players, activeGame.mode, roster, rosterSessionCounts]);
  const filteredAvailableRoster = useMemo(() => availableRoster.filter((entry) => normalizedName(`${entry.name} ${entry.nickname ?? ""}`).includes(normalizedName(rosterSearch))), [availableRoster, rosterSearch]);
  const nextSessionNumber = useMemo(() => Math.max(0, ...games.filter((game) => (game.mode || "chips") === newGameMode).map((game) => Number(fixText(game.name).match(/(?:Sesión|CASHGAME)\s*#?(\d+)/i)?.[1] ?? 0))) + 1, [games, newGameMode]);

  const newGameStakes = calculateGameStakes(Number(newGameBuyIn), newGameCurrency, newGameBuyInBB);
  const newGameStandardBuyIn = newGameStakes?.standardBuyIn ?? 0;
  useEffect(() => {
    const label = newGameStandardBuyIn ? ` (${buyInLabel(newGameStandardBuyIn)})` : "";
    if (modal === "new-game" && !newGameNameEdited) setNewGameName(newGameMode === "temporary" ? `Mesa temporal${label}` : `${newGameMode === "cash" ? "CASHGAME" : "Sesión"} ${nextSessionNumber}${label}`);
  }, [newGameMode, newGameStandardBuyIn, nextSessionNumber, newGameNameEdited, modal]);

  const updateActiveGame = (updater: (game: Game) => Game) => {
    if (!canEdit) return;
    setGames((current) => current.map((game) => game.id === activeGame.id ? updater(game) : game));
  };
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  const openNewGame = () => {
    const buyIn = 500000;
    setNewGameMode("chips");
    setNewGameBuyIn(String(buyIn));
    setNewGameCurrency("PYG"); setNewGameBuyInBB(100); setFormError("");
    setNewGameName(`Sesión ${nextSessionNumber} (${buyInLabel(buyIn)})`);
    setNewGameNameEdited(false);
    setModal("new-game");
  };
  const openAddPlayer = () => {
    setRosterSearch("");
    setPlayerChoice(activeGame.mode === "temporary" ? "__new" : availableRoster[0]?.id ?? "__new");
    setFormError("");
    setModal("add-player");
  };
  const temporaryPlayerIds = useMemo(() => new Set(games.filter((game) => game.mode === "temporary").flatMap((game) => game.players.map((player) => player.id))), [games]);
  const rosterById = useMemo(() => new Map(roster.map((entry) => [entry.id, entry])), [roster]);
  const avatarUrlForPlayer = (player: Player) => temporaryPlayerIds.has(player.id) ? undefined : (rosterById.get(player.id) ?? roster.find((entry) => rosterMatchesPlayer(entry, player)))?.avatarUrl;

  const addMovement = (playerId: string, type: MovementType, amount = activeGame.standardBuyIn) => {
    if (!canEdit || activeGame.status !== "active" || !validAmount(amount)) return false;
    const movement = makeMovement(uid(), type, amount, new Date().toISOString());
    updateActiveGame((game) => ({ ...game, players: game.players.map((player) => player.id === playerId ? { ...player, movements: [...player.movements, movement] } : player) }));
    const player = activeGame.players.find((item) => item.id === playerId);
    setUndoAction({ gameId: activeGame.id, playerId, movement });
    showToast(`${type === "rebuy" ? "Recompra" : "Buy-in"} de ${money(amount)} · ${player?.nickname || player?.name}`);
    return true;
  };
  const undoLast = () => {
    if (!undoAction || !canEdit || !games.some((game) => game.id === undoAction.gameId && game.status === "active")) return;
    setGames((current) => current.map((game) => game.id === undoAction.gameId ? { ...game, players: game.players.map((player) => player.id === undoAction.playerId ? { ...player, movements: player.movements.filter((movement) => movement.id !== undoAction.movement.id) } : player) } : game));
    setUndoAction(null); showToast("Última acción deshecha");
  };
  const openAmount = (playerId: string, type: MovementType) => { if (!canEdit) return; setAmountTarget({ playerId, type }); setCustomAmount(activeGame.standardBuyIn); setModal("amount"); };
  const editMovement = (playerId: string, movement: Movement) => { if (!canEdit) return; setEditingMovement({ playerId, movement }); setCustomAmount(movement.amount); setModal("edit-movement"); };
  const saveEditedMovement = () => {
    if (!editingMovement || !validAmount(customAmount) || !canEdit || activeGame.status !== "active") return;
    updateActiveGame((game) => ({ ...game, players: game.players.map((player) => player.id === editingMovement.playerId ? { ...player, movements: player.movements.map((movement) => movement.id === editingMovement.movement.id ? { ...movement, amount: customAmount } : movement) } : player) }));
    setModal(null); showToast("Movimiento corregido");
  };
  const deleteMovement = () => {
    if (!editingMovement || !canEdit || !window.confirm("¿Eliminar este movimiento definitivamente?")) return;
    updateActiveGame((game) => ({ ...game, players: game.players.map((player) => player.id === editingMovement.playerId ? { ...player, movements: player.movements.filter((movement) => movement.id !== editingMovement.movement.id) } : player) }));
    setModal(null); showToast("Movimiento eliminado");
  };
  const setCashOut = (playerId: string, value: number | null) => {
    if (activeGame.status !== "active" || (value !== null && !validAmount(value, 0))) return;
    updateActiveGame((game) => ({ ...game, players: game.players.map((player) => player.id === playerId ? { ...player, cashOut: value } : player) }));
  };
  const finalizeGame = () => {
    if (!canEdit || activeGame.status !== "active" || !activeGame.players.length || pendingCashOuts) return;
    setActiveGameId(activeGame.id);
    updateActiveGame((game) => ({ ...game, status: "finalized", endedAt: new Date().toISOString() }));
    setUndoAction(null); setModal(null); setView("summary");
    showToast(activeGame.mode === "temporary" ? "Cálculo finalizado · sin guardar" : "Partida finalizada");
  };
  const requestFinalize = () => {
    if (!activeGame.players.length || pendingCashOuts) return;
    if (totals.entered !== totals.cashOuts) return setModal("close-warning");
    finalizeGame();
  };
  const reopenGame = () => { if (!canEdit) return; updateActiveGame((game) => ({ ...game, status: "active", endedAt: null })); setView("cashout"); showToast("Partida reabierta para correcciones"); };

  const createGame = (form: HTMLFormElement) => {
    if (!canEdit) return;
    const data = new FormData(form);
    const stakes = calculateGameStakes(Number(data.get("buyin")), String(data.get("currency")) as EntryCurrency, Number(data.get("buyInBB")) as BuyInBB);
    if (!stakes) { setFormError("Revisá el buy-in, la moneda y las ciegas antes de crear la partida."); return; }
    const { standardBuyIn } = stakes;
    const game: Game = { mode: newGameMode, id: uid(), name: fixText(String(data.get("name") || `Sesión ${nextSessionNumber} (${buyInLabel(standardBuyIn)})`)), ...stakes, startingChips: 0, notes: fixText(String(data.get("notes") || "")), startedAt: new Date().toISOString(), endedAt: null, status: "active", players: [] };
    setGames((current) => [game, ...current]); setActiveGameId(game.id); setSearch(""); setMenuPlayerId(null); setReturnToStats(false);
    setView("live"); setModal(null); showToast("Nueva partida creada");
  };

  const openChangeMode = () => {
    setTargetGameMode(activeGame.mode || "chips"); setFormError(""); setModal("change-mode");
  };
  const changeGameMode = async () => {
    const from = activeGame.mode || "chips";
    if (!canEdit || changingModeRef.current || from === targetGameMode) return;
    changingModeRef.current = true; setChangingMode(true); setFormError("");
    try {
      await saveInFlight.current.catch(() => undefined);
      // Flush debounced cash-outs and edits before moving the server's authoritative copy.
      await persistGames(games);
      const response = await fetch("/api/games", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeGame.id, from, mode: targetGameMode, ...(from === "temporary" ? { game: activeGame } : {}) }) });
      const payload = await response.json() as { game?: Game; error?: string; sheetsPending?: boolean };
      if (!response.ok || !payload.game) throw new Error(payload.error || "No se pudo cambiar el tipo");
      const moved = targetGameMode === "temporary" ? { ...payload.game, players: payload.game.players.map((player) => ({ ...player, id: uid() })) } : payload.game;
      if (targetGameMode === "temporary") savedGames.current.delete(moved.id);
      else savedGames.current.set(moved.id, moved);
      setGames((current) => current.map((game) => game.id === moved.id ? moved : game));
      if (targetGameMode !== "temporary") setArchiveMode(targetGameMode);
      setUndoAction(null); setModal(null);
      showToast(payload.sheetsPending ? "Tipo actualizado · sincronización con Sheets pendiente" : `Partida cambiada a ${modeLabels[targetGameMode]}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo cambiar el tipo");
    } finally { changingModeRef.current = false; setChangingMode(false); }
  };

  const uploadAvatar = async (player: RosterEntry, photo: File) => {
    if (!canEdit) return;
    try {
      showToast("Preparando la foto…");
      const optimizedPhoto = await optimizeProfilePhoto(photo);
      const form = new FormData(); form.set("playerId", player.id); form.set("photo", optimizedPhoto);
      const response = await fetch("/api/avatars", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({ error: response.status === 413 ? "La foto sigue siendo demasiado pesada" : "El servidor no pudo procesar la foto" })) as { avatarKey?: string; avatarUrl?: string; error?: string };
      if (!response.ok || !payload.avatarUrl) return showToast(payload.error || "No se pudo guardar la foto");
      setRoster((current) => current.map((entry) => entry.id === player.id ? { ...entry, avatarKey: payload.avatarKey, avatarUrl: payload.avatarUrl } : entry));
      showToast(`Foto de ${player.nickname || player.name} actualizada`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo preparar la foto");
    }
  };

  const addPlayer = async (form: HTMLFormElement) => {
    if (!canEdit || activeGame.status !== "active" || addingPlayerRef.current) return;
    const data = new FormData(form);
    const amount = Number(data.get("buyin"));
    if (!validAmount(amount)) return setFormError("Ingresá un buy-in entero mayor a cero.");
    const selected = activeGame.mode === "temporary" ? undefined : availableRoster.find((entry) => entry.id === playerChoice);
    let entry = selected;
    const name = String(data.get("name") || "").trim();
    const nickname = String(data.get("nickname") || "").trim();
    if (!entry && !name) return setFormError("Escribí el nombre del jugador.");
    addingPlayerRef.current = true; setAddingPlayer(true); setFormError("");
    try {
      if (!entry && playerKind === "permanente" && activeGame.mode !== "temporary") {
        const response = await fetch("/api/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, nickname }) });
        const payload = await response.json() as { player?: RosterEntry; error?: string };
        if (!response.ok || !payload.player) throw new Error(payload.error || "No se pudo guardar el jugador.");
        entry = cleanRosterEntry(payload.player);
        const registered = entry;
        setRoster((current) => [...current.filter((item) => item.id !== registered.id), registered].sort((a, b) => a.name.localeCompare(b.name)));
      }
      entry ??= { id: uid(), name, nickname, kind: "temporal" };
      const player: Player = { id: entry.id, name: entry.name, nickname: entry.nickname || "", avatar: (entry.nickname || entry.name).slice(0, 1).toUpperCase(), cashOut: null, movements: [makeMovement(uid(), "buyin", amount, new Date().toISOString())] };
      if (activeGame.players.some((item) => item.id === player.id)) throw new Error("Este jugador ya está en la mesa.");
      updateActiveGame((game) => game.status === "active" ? { ...game, players: [...game.players, player] } : game);
      setModal(null); showToast(`${entry.nickname || entry.name} se sumó a la mesa`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo agregar al jugador.");
    } finally { addingPlayerRef.current = false; setAddingPlayer(false); }
  };

  const deleteGame = async () => {
    if (!deleteTarget || !canEdit || deletingIds.current.has(deleteTarget.id)) return;
    const id = deleteTarget.id;
    deletingIds.current.add(id); setDeletingGame(true); setFormError("");
    let deleted = false;
    try {
      await saveInFlight.current.catch(() => undefined);
      if (savedGames.current.has(id)) {
        const response = await fetch(`/api/games?id=${encodeURIComponent(id)}&mode=${deleteTarget.mode || "chips"}`, { method: "DELETE" });
        if (!response.ok) throw new Error("No se pudo eliminar el historial.");
      }
      deleted = true;
      savedGames.current.delete(id);
      setGames((current) => current.filter((game) => game.id !== id));
      setActiveGameId((current) => current === id ? "" : current);
      setDeleteTarget(null); setModal(null); showToast("Historial eliminado");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo eliminar el historial.");
    } finally { if (!deleted) deletingIds.current.delete(id); setDeletingGame(false); }
  };

  const submitLogin = async (form: HTMLFormElement, setup = false) => {
    const data = new FormData(form); setFormError("");
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: setup ? "setup" : "login", username: data.get("username"), password: data.get("password"), setupToken: new URLSearchParams(window.location.search).get("setup") }) });
    const payload = await response.json() as { authenticated?: boolean; username?: string; error?: string };
    if (!response.ok || !payload.authenticated) return setFormError(payload.error || "No se pudo ingresar");
    setAuth({ authenticated: true, username: payload.username ?? "Administrador", setupRequired: false }); setAccessMode("admin"); setView("home"); setModal(null); setFormError(""); window.history.replaceState({}, "", window.location.pathname); showToast(setup ? "Administrador configurado" : "Sesión de administrador iniciada");
  };
  const logout = async () => {
    if (games.some((game) => game.mode === "temporary") && !window.confirm("¿Salir y descartar las partidas temporales?")) return;
    try {
      await persistGames(games);
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo cerrar sesión.");
      setAuth((current) => ({ ...current, authenticated: false, username: "" }));
      setGames((current) => current.filter((game) => game.mode !== "temporary"));
      setAccessMode("entry"); setView("home"); setUndoAction(null);
    } catch { showToast("No se pudo salir. Revisá la conexión y volvé a intentar."); }
  };
  const openSettings = async () => { setModal("settings"); setFormError(""); const response = await fetch("/api/settings"); if (response.ok) { const payload = await response.json() as { connected?: boolean; bridgeUrl?: string }; setSettings({ connected: Boolean(payload.connected), bridgeUrl: payload.bridgeUrl ?? "" }); } };
  const saveSettings = async (form: HTMLFormElement) => {
    const data = new FormData(form); setFormError("");
    try { await persistGames(games); } catch { return setFormError("Primero volvé a intentar guardar los cambios de la mesa."); }
    const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bridgeUrl: data.get("bridgeUrl"), bridgeSecret: data.get("bridgeSecret") }) });
    const payload = await response.json() as { connected?: boolean; importedGames?: number; error?: string };
    if (!response.ok) return setFormError(payload.error || "No se pudo conectar");
    await loadData(); setSettings({ connected: true, bridgeUrl: String(data.get("bridgeUrl")) }); setModal(null); showToast(`Google Sheets conectado · ${payload.importedGames ?? 0} partidas importadas`);
  };

  const shareSummary = async () => {
    const textSummary = `${activeGame.name} · Casa Linda Poker\n${[...activeGame.players].sort((a, b) => result(b) - result(a)).map((player, index) => `${index + 1}. ${player.nickname || player.name}: ${result(player) >= 0 ? "+" : ""}${money(result(player))}`).join("\n")}`;
    try { if (typeof navigator.share === "function") { await navigator.share({ title: activeGame.name, text: textSummary }); showToast("Resumen compartido"); } else { await navigator.clipboard.writeText(textSummary); showToast("Resumen copiado"); } } catch { /* diálogo cerrado */ }
  };
  const downloadSummaryImage = () => {
    const ranking = [...activeGame.players].sort((a, b) => result(b) - result(a));
    const rowStep = 122;
    const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = Math.max(1080, 350 + ranking.length * rowStep + 100); const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#09090b"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#992224"; ctx.fillRect(0, 0, canvas.width, 12); ctx.fillStyle = "#ffffff"; ctx.font = "700 34px Arial"; ctx.fillText("CASA LINDA POKER", 80, 100); ctx.fillStyle = "#faf9fa"; ctx.font = "700 66px Arial"; ctx.fillText("Resultados de la noche", 80, 190); ctx.fillStyle = "#b0acb5"; ctx.font = "30px Arial"; ctx.fillText(`${activeGame.name} · ${dateTime(activeGame.startedAt)}`, 80, 245);
    ranking.forEach((player, index) => { const y = 360 + index * rowStep; ctx.fillStyle = "#201e23"; ctx.fillRect(70, y - 62, 940, 100); ctx.fillStyle = "#faf9fa"; ctx.font = "600 34px Arial"; ctx.fillText(`${index + 1}. ${player.nickname || player.name}`, 105, y); ctx.fillStyle = result(player) > 0 ? "#65d6ba" : result(player) < 0 ? "#f2a17a" : "#b0acb5"; ctx.textAlign = "right"; ctx.fillText(`${result(player) > 0 ? "+" : ""}${money(result(player))}`, 970, y); ctx.textAlign = "left"; });
    ctx.fillStyle = "#b0acb5"; ctx.font = "24px Arial"; ctx.fillText(`${ranking.length} jugadores · Resumen completo`, 80, canvas.height - 45);
    const link = document.createElement("a"); link.download = `${activeGame.name.toLowerCase().replaceAll(" ", "-")}-resultados.png`; link.href = canvas.toDataURL("image/png"); link.click(); showToast("Resumen descargado como imagen");
  };

  const selectGame = (game: Game, targetView: View = game.status === "finalized" ? "summary" : "live") => {
    setActiveGameId(game.id); setSearch(""); setMenuPlayerId(null); setView(targetView);
  };
  const navigate = (target: View) => {
    setReturnToStats(false); setSearch(""); setMenuPlayerId(null);
    if ((target === "live" || target === "cashout") && liveGame) setActiveGameId(liveGame.id);
    setView(target);
  };
  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "home", label: "Inicio", icon: "home" },
    { id: "live", label: "En vivo", icon: "live" },
    ...(canEdit ? [{ id: "cashout" as View, label: "Caja", icon: "cashout" }] : []),
    { id: "history", label: "Historial", icon: "history" },
    { id: "stats", label: "Estadísticas", icon: "stats" },
  ];

  if (accessMode === "entry") {
    return <main className="entry-screen">
      <div className="entry-glow" />
      <section className="entry-card">
        <div className="entry-brand"><span className="brand-mark brand-logo large"><Image src="/casa-linda-icon.png" alt="" width={56} height={56} priority unoptimized /></span><div><span>CASA LINDA</span><strong>POKER</strong></div></div>
        <div className="entry-copy"><span className="section-kicker">CLUB DE PÓKER</span><h1>Historial de partidas</h1><p>Seguí las mesas, repasá los resultados y llevá la cuenta de cada sesión.</p></div>
        <div className="entry-options">
          <button className="access-card viewer" onClick={() => { setAccessMode("viewer"); setView("home"); }}><span className="access-icon"><AppIcon name="eye" /></span><span><small>ACCESO PÚBLICO</small><strong>Entrar como visitante</strong><em>Historial, estadísticas y mesa en modo lectura.</em></span><b>Entrar →</b></button>
          <button className="access-card admin" onClick={() => { if (auth.authenticated) { setAccessMode("admin"); setView("home"); } else if (auth.setupRequired) setFormError("Abrí tu enlace privado de configuración inicial."); else { setFormError(""); setModal("login"); } }}><span className="access-icon"><AppIcon name="lock" /></span><span><small>ACCESO PRIVADO</small><strong>{auth.authenticated ? `Continuar como ${auth.username}` : "Entrar como administrador"}</strong><em>Usuario y contraseña para administrar los movimientos.</em></span><b>{auth.authenticated ? "Continuar →" : "Ingresar →"}</b></button>
        </div>
        {formError && !modal && <p className="entry-error">{formError}</p>}
      </section>
      {modal && <div className="modal-backdrop">{modal === "login" && <AuthModal setup={false} error={formError} close={() => setModal(null)} submit={submitLogin} />}{modal === "setup" && <AuthModal setup error={formError} close={() => setModal(null)} submit={submitLogin} />}</div>}
    </main>;
  }

  return <main className={`app-shell ${canEdit ? "admin-mode" : "viewer-mode"}`}>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("home")} aria-label="Ir a Inicio"><span className="brand-mark brand-logo"><Image src="/casa-linda-icon.png" alt="" width={43} height={43} unoptimized /></span><span><strong>Casa Linda</strong><small>Poker</small></span></button>
      <nav className="side-nav" aria-label="Navegación principal">{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><AppIcon name={item.icon} /><span>{item.label}</span>{item.id === "live" && activeGame.status === "active" && <i />}</button>)}</nav>
      <div className="sidebar-game"><div className="eyebrow">{liveGame ? <span className="live-dot" /> : <span>♠</span>} {liveGame ? "Mesa en vivo" : "Casa Linda Poker"}</div><strong>{liveGame?.name ?? "Sin mesa activa"}</strong><span>{liveGame ? `${liveGame.players.length} jugadores · ${duration(liveGame.startedAt)}` : "Historial y estadísticas del club"}</span></div>
      {canEdit ? <div className={`save-state ${saveState}`}><span />{activeGame.mode === "temporary" ? "Temporal · no se guarda" : saveState === "saved" ? "Guardado automático" : saveState === "saving" ? "Guardando cambios…" : "Guardado pendiente"}</div> : <div className="readonly-note"><AppIcon name="eye" /> Solo lectura</div>}
    </aside>

    <section className="content-shell">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark brand-logo"><Image src="/casa-linda-icon.png" alt="" width={36} height={36} priority unoptimized /></span><strong className="shell-header__mobile-title">Casa Linda Poker</strong></div>
        <div className="topbar-actions">
          <span className={`role-pill ${canEdit ? "admin" : "viewer"}`}><AppIcon name={canEdit ? "lock" : "eye"} /> {canEdit ? auth.username : "Visitante"}</span>
          {canEdit && <button className="icon-button" onClick={openSettings} title="Configuración" aria-label="Configuración"><AppIcon name="settings" /></button>}
          {canEdit && undoAction && <button className="icon-button" onClick={undoLast} title="Deshacer última acción" aria-label="Deshacer última acción"><AppIcon name="undo" /></button>}
          {canEdit && <button className="primary compact topbar-new-game" onClick={openNewGame}><AppIcon name="add" /> Nueva partida</button>}
          <button className="ghost compact access-switch" onClick={canEdit ? logout : () => { setFormError(""); setAccessMode("entry"); }} aria-label={canEdit ? "Cerrar sesión" : "Cambiar acceso"} title={canEdit ? "Cerrar sesión" : "Cambiar acceso"}><AppIcon name="exit" /><span className="access-switch__label">{canEdit ? "Salir" : "Cambiar acceso"}</span></button>
        </div>
      </header>

      <div className={`page-content ${view === "live" ? "page-content--live" : ""}`}>
        {dataError && <div className="data-notice" role="status"><span>No pudimos cargar todos los datos.</span><button className="secondary" onClick={async () => {
          try { if (canEdit) await persistGames(games); await loadData(); }
          catch { showToast("Primero volvé a intentar guardar la mesa."); }
        }}>Reintentar</button></div>}
        {canEdit && (view === "live" || view === "cashout" || view === "summary") && activeGame.id !== "empty" && <div className={`save-state save-state--mobile ${saveState}`} role="status"><span />{activeGame.mode === "temporary" ? "Solo en esta pestaña" : saveState === "pending" ? "Guardado pendiente" : saveState === "saving" ? "Guardando cambios…" : "Guardado automático"}{saveState === "pending" && <button className="secondary" onClick={() => persistGames(games).catch(() => showToast("Todavía no se pudo guardar."))}>Reintentar guardado</button>}</div>}
        {(view === "live" || view === "cashout" || view === "summary") && activeGame.id !== "empty" && <div className="game-mode-note"><strong>{modeLabels[activeGame.mode || "chips"]}</strong>{activeGame.mode === "temporary" && <><span>Solo en esta pestaña. No se guarda al recargar o cerrar.</span><button className="secondary" onClick={() => { if (window.confirm("¿Descartar esta partida temporal y sus jugadores?")) { setGames((current) => current.filter((game) => game.id !== activeGame.id)); setView("home"); } }}>Descartar</button></>}</div>}
        {(view === "live" || view === "cashout" || view === "summary") && activeGame.inputCurrency === "USD" && <p className="game-mode-note">Buy-in original: {activeGame.inputBuyIn?.toLocaleString("es-PY")} USD = {money(activeGame.standardBuyIn)} · cambio fijo: 1 USD = {money(activeGame.exchangeRate ?? 6000)}. Operaciones en Gs.</p>}
        {view === "home" && <section className="home-page">
          <section className="dashboard-intro">
            <div className="dashboard-intro__content">
              <div className="dashboard-intro__meta"><span className="section-kicker">CASA LINDA POKER</span>{liveGame && <span className="session-status active"><span className="live-dot" /> MESA EN VIVO</span>}</div>
              <h1 className="dashboard-intro__title">{canEdit ? "Tu mesa. Tus partidas." : "La casa del póker."}</h1>
              <p className="dashboard-intro__description">{canEdit ? "Organizá la mesa, registrá recompras y cerrá la caja desde un solo lugar." : "Seguí la acción de la mesa y explorá el historial de Casa Linda."}</p>
              <div className="heading-actions">
                {canEdit && <button className="primary" onClick={openNewGame}><AppIcon name="add" /> Nueva partida</button>}
                {liveGame ? <button className={canEdit ? "secondary" : "primary"} onClick={() => selectGame(liveGame)}><AppIcon name="live" /> Abrir mesa</button> : !canEdit && <button className="primary" onClick={() => navigate("history")}><AppIcon name="history" /> Ver historial</button>}
              </div>
            </div>
            <div className="dashboard-intro__art" aria-hidden="true" />
          </section>
          <div className="dashboard-stats" aria-label="Resumen de Casa Linda">
            <article className="dashboard-stat"><span><AppIcon name="history" /> Sesiones cerradas</span><strong>{loaded ? savedSessions.length : "—"}</strong><small>Fichas y CASHGAME</small></article>
            <article className="dashboard-stat"><span><AppIcon name="players" /> En la mesa</span><strong>{loaded ? liveGame?.players.length ?? 0 : "—"}</strong><small>{liveGame?.name ?? "Sin mesa activa"}</small></article>
            <article className="dashboard-stat"><span><AppIcon name="live" /> Buy-in actual</span><strong>{liveGame ? money(liveGame.standardBuyIn) : "—"}</strong><small>{liveGame ? `Ciegas: ${liveGame.blinds}` : "Se muestra al abrir una mesa"}</small></article>
          </div>
          <div className="home-links" aria-label="Secciones principales">
            <button onClick={() => navigate("live")}><span className="home-link-icon"><AppIcon name="live" /></span><span><strong>En vivo</strong><small>Ver la mesa y sus movimientos</small></span><b aria-hidden="true">→</b></button>
            <button onClick={() => navigate("history")}><span className="home-link-icon"><AppIcon name="history" /></span><span><strong>Historial</strong><small>Explorar las sesiones de la casa</small></span><b aria-hidden="true">→</b></button>
            <button onClick={() => navigate("stats")}><span className="home-link-icon"><AppIcon name="stats" /></span><span><strong>Estadísticas</strong><small>Ver rankings y perfiles</small></span><b aria-hidden="true">→</b></button>
          </div>
          {canEdit && temporaryGames.length > 0 && <section className="temporary-sessions">
            <div><span className="section-kicker">SOLO EN ESTA PESTAÑA</span><h2>Mesas temporales</h2></div>
            <div className="home-links">
              {temporaryGames.map((game) => <button key={game.id} onClick={() => selectGame(game)}><span className="home-link-icon"><AppIcon name="live" /></span><span><strong>{game.name}</strong><small>{game.status === "active" ? "Continuar en vivo" : "Volver al resumen"}</small></span><b aria-hidden="true">→</b></button>)}
            </div>
          </section>}
        </section>}

        {(view === "live" || view === "cashout") && !liveGame && <section className="empty-state">
          <span className="empty-state__icon"><AppIcon name="live" /></span>
          <h1>{!loaded ? "Cargando la mesa…" : dataError ? "No pudimos cargar la mesa" : "No hay una mesa activa"}</h1>
          <p>{!loaded ? "Estamos consultando las últimas partidas." : dataError ? "Usá el botón Reintentar para volver a consultar." : canEdit ? "Creá una partida para empezar a registrar jugadores y movimientos." : "Cuando se abra una partida, vas a poder seguirla desde acá."}</p>
          {loaded && <button className="primary" onClick={canEdit ? openNewGame : () => navigate("history")}>{canEdit ? "Nueva partida" : "Ver historial"}</button>}
        </section>}

        {view === "live" && liveGame && <>
          <section className="session-hero"><div className="session-title-block"><div className={`session-status ${activeGame.status}`}><span className={activeGame.status === "active" ? "live-dot" : ""} />{activeGame.status === "active" ? "EN VIVO" : "PARTIDA FINALIZADA"}</div><h1>{activeGame.name}</h1><div className="session-meta"><span><AppIcon name="clock" /> {time(activeGame.startedAt)}</span><span><AppIcon name="players" /> {totals.players} jugadores</span><span>◷ {duration(activeGame.startedAt, activeGame.endedAt)}</span></div><p className="session-description">{activeGame.blinds || "5.000 / 10.000"}{activeGame.notes ? ` · ${activeGame.notes}` : ""}</p></div>{canEdit && <div className="heading-actions"><button className="secondary" onClick={() => navigate("cashout")}>Cierre de caja</button><button className="primary" onClick={openAddPlayer}><AppIcon name="add" /> Agregar jugador</button></div>}</section>
          {!canEdit && <div className="viewer-banner"><AppIcon name="eye" /><span><strong>Vista pública</strong> Últimos movimientos guardados · Solo lectura</span></div>}
          <section className="metric-grid"><article className="metric featured"><span>Dinero en la mesa</span><strong>{activeGame.legacy ? "Histórico" : money(totals.entered)}</strong><small>{activeGame.legacy ? "Resultado neto importado" : `${totals.buyIns} buy-ins · ${totals.rebuys} recompras`}</small><i aria-hidden="true">♠</i></article><article className="metric"><span>Jugadores</span><strong>{totals.players}</strong><small>En la mesa</small></article><article className="metric"><span>Buy-in estándar</span><strong>{money(activeGame.standardBuyIn)}</strong><small>Valor configurado</small></article><article className="metric duration-metric"><span>Duración</span><strong>{duration(activeGame.startedAt, activeGame.endedAt)}</strong><small>Desde las {time(activeGame.startedAt)}</small></article></section>
          <div className="live-content"><section className="club-overview">
            <MiniPokerTable game={activeGame} avatarUrlForPlayer={avatarUrlForPlayer} />
            <aside className="activity-panel"><div className="panel-title"><div><span className="section-kicker">MOVIMIENTOS</span><h3>Actividad reciente</h3></div><span className="pulse" /></div><div className="activity-list" aria-live="polite">{recentMovements.length ? recentMovements.map((movement) => <div className={`activity-item ${movement.type}`} key={movement.id}><span className="activity-icon">{movement.type === "rebuy" ? "↻" : "+"}</span><div><strong>{movement.playerName}</strong><span>{movement.type === "rebuy" ? "realizó una recompra" : "ingresó a la partida"} · {time(movement.createdAt)}</span></div><b>{compactMoney(movement.amount)}</b></div>) : <p className="empty-note">Sin movimientos detallados.</p>}</div><div className="table-note"><span>Buy-in de la casa</span><strong>{money(activeGame.standardBuyIn)}</strong></div></aside>
          </section>
          <section className="players-area"><div className="section-toolbar"><div><span className="section-kicker">ASIENTOS</span><h2>Jugadores</h2><span>{search ? `${sortedPlayers.length} de ${totals.players}` : `${totals.players} en la mesa`}</span></div><div className="filters"><label className="search-box"><AppIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar jugador" aria-label="Buscar jugador" /></label><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Ordenar jugadores"><option value="inversion">Mayor inversión</option><option value="menor">Menor inversión</option><option value="recompras">Más recompras</option><option value="nombre">Nombre</option></select></div></div>
            {!sortedPlayers.length && <p className="empty-note">{search ? "Ningún jugador coincide con la búsqueda." : "Todavía no hay jugadores en esta mesa."}</p>}
            <div className="player-grid">{sortedPlayers.map((player) => { const buyIns = player.movements.filter((movement) => movement.type === "buyin").length; const rebuys = player.movements.filter((movement) => movement.type === "rebuy").length; const latest = [...player.movements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]; return <article className="player-card" key={player.id}><div className="player-top"><ProfileAvatar name={player.nickname || player.name} url={avatarUrlForPlayer(player)} large /><div className="player-identity"><strong>{player.nickname || player.name}</strong><span>{player.nickname ? player.name : activeGame.legacy ? "Histórico" : "Jugador"}</span></div>{player.movements.length > 0 && <button className="card-menu" onClick={() => setMenuPlayerId(menuPlayerId === player.id ? null : player.id)} aria-expanded={menuPlayerId === player.id} aria-label={`Ver movimientos de ${player.name}`}><AppIcon name="menu" /></button>}</div><div className="player-total"><span>{activeGame.legacy ? "Resultado" : "Inversión"}</span><strong className={activeGame.legacy ? result(player) > 0 ? "positive" : result(player) < 0 ? "negative" : "neutral" : ""}>{activeGame.legacy ? `${result(player) > 0 ? "+" : ""}${money(result(player))}` : money(invested(player))}</strong></div><div className="player-meta"><span><b>{buyIns}</b> buy-in{buyIns !== 1 ? "s" : ""}</span><span><b>{rebuys}</b> recompra{rebuys !== 1 ? "s" : ""}</span><span>Último {latest ? time(latest.createdAt) : "—"}</span></div>{canEdit && !activeGame.legacy && <><div className="player-actions"><button className="buyin-button" onClick={() => addMovement(player.id, "buyin")}><AppIcon name="add" /> Buy-in</button><button className="rebuy-button" onClick={() => addMovement(player.id, "rebuy")}><AppIcon name="add" /> Recompra</button></div><button className="custom-link" onClick={() => openAmount(player.id, "rebuy")}>½ buy-in o monto personalizado</button></>}{menuPlayerId === player.id && <div className="movement-list"><div className="movement-list-title"><strong>Movimientos</strong><button onClick={() => setMenuPlayerId(null)} aria-label="Cerrar movimientos"><AppIcon name="close" /></button></div>{[...player.movements].reverse().map((movement) => <button key={movement.id} disabled={!canEdit} onClick={() => editMovement(player.id, movement)}><span><i className={movement.type} />{movement.type === "rebuy" ? "Recompra" : "Buy-in"}<small>{time(movement.createdAt)}</small></span><strong>{money(movement.amount)} {canEdit && <em>Editar</em>}</strong></button>)}</div>}</article>; })}{canEdit && !activeGame.legacy && <button className="add-player-card" onClick={openAddPlayer}><span><AppIcon name="add" /></span><strong>Agregar jugador</strong><small>{activeGame.mode === "temporary" ? "Crear un jugador temporal" : "Elegir registrado o crear uno"}</small></button>}</div>
          </section></div>
        </>}

        {view === "cashout" && canEdit && liveGame && <section className="cashout-page">
          <div className="page-heading"><div><div className="eyebrow">Cierre de caja</div><h1>¿Con cuánto terminó cada uno?</h1><p>Ingresá el valor final de las fichas en guaraníes. Si alguien terminó sin fichas, ingresá 0.</p></div><button className="secondary" onClick={() => navigate("live")}>Volver a la mesa</button></div>
          <div className={`balance-banner ${!totals.players || pendingCashOuts ? "pending" : totals.cashOuts === totals.entered ? "balanced" : totals.cashOuts < totals.entered ? "missing" : "extra"}`}>
            <div className="balance-icon" aria-hidden="true">{!totals.players || pendingCashOuts ? "◷" : totals.cashOuts === totals.entered ? "✓" : "!"}</div>
            <div><span>{!totals.players || pendingCashOuts ? "Caja por completar" : totals.cashOuts === totals.entered ? "Caja cuadrada" : totals.cashOuts < totals.entered ? "Faltante en caja" : "Sobrante en caja"}</span><strong>{!totals.players ? "Sin jugadores" : pendingCashOuts ? `Falta ${pendingCashOuts} de ${totals.players}` : totals.cashOuts === totals.entered ? "Todo coincide" : money(Math.abs(totals.entered - totals.cashOuts))}</strong></div>
            <div className="balance-totals"><span>Ingresado <b>{money(totals.entered)}</b></span><span>Cash-outs <b>{money(totals.cashOuts)}</b></span></div>
          </div>
          {totals.players > 0 && <div className="cashout-table"><div className="cashout-head"><span>Jugador</span><span>Invertido</span><span>Cash-out final</span><span>Resultado</span><span>ROI</span></div>
            {activeGame.players.map((player) => {
              const investment = invested(player);
              const profit = result(player);
              const roi = investment ? (profit / investment) * 100 : 0;
              const valueStyle = player.cashOut === null ? "neutral" : profit > 0 ? "positive" : profit < 0 ? "negative" : "neutral";
              return <div className="cashout-row" key={player.id}>
                <div className="cashout-player"><ProfileAvatar name={player.nickname || player.name} url={avatarUrlForPlayer(player)} /><div><strong>{player.nickname || player.name}</strong><small>{player.movements.filter((m) => m.type === "buyin").length} buy-in · {player.movements.filter((m) => m.type === "rebuy").length} recompras</small></div></div>
                <strong><small className="cashout-cell-label">Invertido</small>{money(investment)}</strong>
                <label className="money-input"><span>Gs.</span><input aria-label={`Cash-out final de ${player.nickname || player.name}`} type="number" inputMode="numeric" min="0" step="1" placeholder="Cash-out" value={player.cashOut ?? ""} onChange={(event) => setCashOut(player.id, event.target.value === "" ? null : Number(event.target.value))} /></label>
                <strong className={valueStyle}><small className="cashout-cell-label">Resultado</small>{player.cashOut === null ? "—" : `${profit > 0 ? "+" : ""}${money(profit)}`}</strong>
                <span className={valueStyle}><small className="cashout-cell-label">ROI</small>{player.cashOut === null ? "—" : `${roi > 0 ? "+" : ""}${roi.toFixed(1)}%`}</span>
              </div>;
            })}
          </div>}
          <div className="cashout-footer"><div><strong>{!totals.players ? "Agregá jugadores para cerrar la caja" : pendingCashOuts ? "Completá los cash-outs pendientes" : "Verificá los valores antes de cerrar"}</strong><span>Podrás reabrir la partida si necesitás corregir algo.</span></div><button className="primary large" onClick={requestFinalize} disabled={!totals.players || pendingCashOuts > 0}>Finalizar partida</button></div>
        </section>}

        {view === "history" && <div className="archive-tabs" role="group" aria-label="Base de resultados"><button className={archiveMode === "chips" ? "selected" : ""} aria-pressed={archiveMode === "chips"} onClick={() => setArchiveMode("chips")}>Fichas</button><button className={archiveMode === "cash" ? "selected" : ""} aria-pressed={archiveMode === "cash"} onClick={() => setArchiveMode("cash")}>CASHGAME · real</button>{archiveMode === "cash" && canEdit && <a href="/api/cash-export" download>Exportar plantilla CSV</a>}</div>}

        {view === "history" && <section className="history-page"><div className="page-heading"><div><div className="eyebrow">Archivo de Casa Linda</div><h1>{archiveMode === "cash" ? "Historial CASHGAME" : "Historial de partidas"}</h1><p>{archiveMode === "cash" ? "Dinero real · registro independiente de las partidas a fichas." : "Partidas a fichas · historial habitual."}</p></div>{canEdit && <button className="primary" onClick={openNewGame}><AppIcon name="add" /> Nueva partida</button>}</div><div className="history-filter"><label className="search-box"><AppIcon name="search" /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Buscar partida" aria-label="Buscar partida en el historial" /></label><span>{archivedGames.length} {archivedGames.length === 1 ? "partida" : "partidas"}</span></div><div className="history-list">{!archivedGames.length && <p className="game-mode-note">{!loaded ? "Cargando historial…" : dataError ? "No se pudo cargar el historial completo." : historySearch ? "No se encontraron partidas con ese nombre." : "Todavía no hay partidas en este registro."}</p>}{archivedGames.map((game) => { const total = game.players.reduce((sum, player) => sum + invested(player), 0); return <article key={game.id} className="history-card" onClick={() => selectGame(game)}><span className={`status-pill ${game.status}`}><i />{game.status === "active" ? "Activa" : "Finalizada"}</span><div className="history-main"><div className="history-suit">♠</div><div className="history-main-copy"><strong>{game.name}</strong><span>{dateTime(game.startedAt)} · {game.legacy ? "Importada de Sheets" : game.blinds || "5.000 / 10.000"}</span><div className="history-avatars" aria-label={`Jugadores de ${game.name}`}>{game.players.slice(0, 5).map((player) => <ProfileAvatar key={player.id} name={player.nickname || player.name} url={avatarUrlForPlayer(player)} />)}{game.players.length > 5 && <span className="history-avatar-more">+{game.players.length - 5}</span>}</div></div></div><div className="history-stat"><span>Jugadores</span><strong>{game.players.length}</strong></div><div className="history-stat"><span>Total jugado</span><strong>{game.legacy ? "—" : money(total)}</strong></div><div className="history-stat"><span>Duración</span><strong>{game.legacy ? "Histórica" : duration(game.startedAt, game.endedAt)}</strong></div><div className="history-actions"><button className="history-open" onClick={(event) => { event.stopPropagation(); selectGame(game); }}>{game.status === "active" ? "Ver en vivo" : "Ver resumen"} →</button>{canEdit && <button className="history-delete" onClick={(event) => { event.stopPropagation(); setDeleteTarget(game); setFormError(""); setModal("delete-game"); }} aria-label={`Eliminar ${game.name}`}><AppIcon name="trash" /> Eliminar</button>}</div></article>; })}</div></section>}
        {returnToStats && (view === "summary" || view === "live") && <button className="secondary profile-back" onClick={() => { setView("stats"); setReturnToStats(false); }}>← Volver al perfil del jugador</button>}
        {view === "stats" && <PlayerStatistics games={games} roster={roster} canEdit={canEdit} selectedKey={statsSelectedKey} onSelect={setStatsSelectedKey} filter={statsFilter} onFilter={setStatsFilter} onUpload={(id, photo) => { const player = roster.find(entry => entry.id === id); if (player) uploadAvatar(player, photo); }} onOpen={(id) => { const game = games.find(entry => entry.id === id); if (game) { setReturnToStats(true); selectGame(game); } }} />}
        {view === "summary" && activeGame.id !== "empty" && <SummaryView game={activeGame} canEdit={canEdit && !activeGame.legacy} onChangeMode={canEdit ? openChangeMode : undefined} avatarUrlForPlayer={avatarUrlForPlayer} onShare={shareSummary} onDownload={downloadSummaryImage} onPrint={() => window.print()} onReopen={reopenGame} />}
      </div>
    </section>

    <nav className="mobile-nav" aria-label="Navegación móvil">{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><AppIcon name={item.icon} /><span>{item.label === "Estadísticas" ? "Stats" : item.label}</span></button>)}</nav>
    {toast && <div className="toast" role="status"><span aria-hidden="true">♠</span><p>{toast}</p>{canEdit && undoAction && toast.includes("Gs.") && <button onClick={undoLast}>Deshacer</button>}</div>}

    {modal && <div className="modal-backdrop" onMouseDown={(event) => !changingMode && !addingPlayer && !deletingGame && event.target === event.currentTarget && setModal(null)}>
      {modal === "change-mode" && <Modal title="Cambiar tipo de partida" subtitle={activeGame.name} close={() => { if (!changingMode) setModal(null); }}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); changeGameMode(); }}><fieldset className="mode-picker full" disabled={changingMode}><legend>Guardar esta sesión como</legend>{(["chips", "cash", "temporary"] as GameMode[]).map((mode) => <label className={targetGameMode === mode ? "selected" : ""} key={mode}><input type="radio" name="targetMode" checked={targetGameMode === mode} onChange={() => setTargetGameMode(mode)} /><span><strong>{modeLabels[mode]}</strong><small>{mode === "chips" ? "Historial y estadísticas habituales de fichas." : mode === "cash" ? "Registro y estadísticas exclusivos de dinero real." : "Se quita del historial. Solo permanece en esta pestaña hasta recargarla o cerrarla."}</small></span></label>)}</fieldset>{targetGameMode === "temporary" && <div className="warning-box full"><span>!</span><div><strong>Dejará de guardarse</strong><p>Se retirará de ambos historiales y sus estadísticas. Podés volver a guardarla desde este resumen antes de cerrar o recargar. Los perfiles permanentes ya registrados se conservan.</p></div></div>}{activeGame.legacy && <p className="mode-help full">Sesión importada: se reclasifica en esta app. El registro original de Google Sheets se conserva.</p>}{formError && <p className="form-error full" role="alert">{formError}</p>}<button className="primary large full" type="submit" disabled={changingMode || targetGameMode === (activeGame.mode || "chips")}>{changingMode ? "Actualizando…" : targetGameMode === "temporary" ? "Convertir y quitar del historial" : "Guardar tipo de partida"}</button></form></Modal>}
      {modal === "new-game" && <Modal title="Nueva partida" subtitle="Configurá la mesa en menos de un minuto" close={() => setModal(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); createGame(event.currentTarget); }}><fieldset className="mode-picker full"><legend>Tipo de partida</legend>{(["chips", "cash", "temporary"] as GameMode[]).map((mode) => <label key={mode} className={newGameMode === mode ? "selected" : ""}><input type="radio" name="mode" value={mode} checked={newGameMode === mode} onChange={() => setNewGameMode(mode)} /><span><strong>{modeLabels[mode]}</strong><small>{mode === "chips" ? "Historial habitual y Google Sheets de fichas." : mode === "cash" ? "Base exclusiva CASHGAME y estadísticas separadas. No se mezcla con fichas." : "Calculadora para otra mesa. Todos los jugadores son nuevos; nada se guarda. Se pierde al recargar o cerrar la pestaña."}</small></span></label>)}</fieldset><label className="full">Nombre de la partida<input name="name" value={newGameName} onChange={(event) => { setNewGameName(event.target.value); setNewGameNameEdited(true); }} /></label><StakeFields amount={newGameBuyIn} currency={newGameCurrency} buyInBB={newGameBuyInBB} onAmount={(value) => { setNewGameBuyIn(value); setFormError(""); }} onCurrency={(currency) => { setNewGameCurrency(currency); setNewGameBuyIn(""); setFormError(""); }} onBuyInBB={setNewGameBuyInBB} /><label className="full">Notas<textarea name="notes" placeholder="Formato, reglas o detalles de la noche" /></label>{formError && <p className="full stake-error" role="alert">{formError}</p>}<button className="primary large full" type="submit" disabled={!newGameStakes}>Crear y abrir la mesa</button></form></Modal>}
      {modal === "add-player" && <Modal title="Agregar jugador" subtitle={activeGame.mode === "temporary" ? "Jugadores nuevos · no se guardan" : "Los más frecuentes aparecen primero"} close={() => { if (!addingPlayer) setModal(null); }}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); addPlayer(event.currentTarget); }}>{activeGame.mode !== "temporary" && <><label className="full">Buscar jugador<div className="search-box roster-search-box"><AppIcon name="search" /><input autoFocus value={rosterSearch} onChange={(event) => { const query = event.target.value; setRosterSearch(query); const firstMatch = availableRoster.find((entry) => normalizedName(`${entry.name} ${entry.nickname ?? ""}`).includes(normalizedName(query))); setPlayerChoice(firstMatch?.id ?? "__new"); setFormError(""); }} placeholder="Escribí un nombre o apodo" /></div></label><label className="full">Jugador<select value={playerChoice} onChange={(event) => { setPlayerChoice(event.target.value); setFormError(""); }}>{filteredAvailableRoster.length ? filteredAvailableRoster.map((entry) => { const sessions = rosterSessionCounts.get(entry.id) ?? 0; return <option key={entry.id} value={entry.id}>{entry.nickname ? `${entry.nickname} · ${entry.name}` : entry.name} · {sessions} {sessions === 1 ? "sesión" : "sesiones"}</option>; }) : <option value="__empty" disabled>Sin coincidencias registradas</option>}<option value="__new">＋ Añadir una persona nueva</option></select></label></>}{playerChoice === "__new" && <><label>Nombre<input name="name" placeholder="Nombre del jugador" /></label><label>Apodo <small>opcional</small><input name="nickname" placeholder="Cómo aparece" /></label>{activeGame.mode !== "temporary" && <label className="full">Guardar como<select value={playerKind} onChange={(event) => setPlayerKind(event.target.value as "temporal" | "permanente")}><option value="temporal">Temporal · solo esta partida</option><option value="permanente">Permanente · queda registrado</option></select></label>}</>}<label className="full">Buy-in inicial<input name="buyin" type="number" inputMode="numeric" min="1" step="1" required defaultValue={activeGame.standardBuyIn} /></label>{formError && <p className="form-error full" role="alert">{formError}</p>}<button className="primary large full" type="submit" disabled={addingPlayer}>{addingPlayer ? "Agregando…" : "Agregar con buy-in"}</button></form></Modal>}
      {modal === "amount" && amountTarget && <Modal title={amountTarget.type === "rebuy" ? "Registrar recompra" : "Registrar buy-in"} subtitle="Elegí un monto rápido o escribí otro" close={() => setModal(null)}><div className="quick-amounts"><button type="button" onClick={() => setCustomAmount(activeGame.standardBuyIn)} className={customAmount === activeGame.standardBuyIn ? "selected" : ""}>+1 buy-in<strong>{money(activeGame.standardBuyIn)}</strong></button><button type="button" onClick={() => setCustomAmount(Math.max(1, Math.round(activeGame.standardBuyIn / 2)))} className={customAmount === Math.max(1, Math.round(activeGame.standardBuyIn / 2)) ? "selected" : ""}>+½ buy-in<strong>{money(Math.max(1, Math.round(activeGame.standardBuyIn / 2)))}</strong></button></div><label className="custom-amount-label">Monto personalizado<div className="money-input large"><span>Gs.</span><input type="number" inputMode="numeric" value={customAmount} onChange={(event) => setCustomAmount(Number(event.target.value))} /></div></label><button className="primary large full-width" disabled={!validAmount(customAmount)} onClick={() => { if (addMovement(amountTarget.playerId, amountTarget.type, customAmount)) setModal(null); }}>Confirmar {money(customAmount)}</button></Modal>}
      {modal === "edit-movement" && editingMovement && <Modal title="Corregir movimiento" subtitle={`${editingMovement.movement.type === "rebuy" ? "Recompra" : "Buy-in"} registrada a las ${time(editingMovement.movement.createdAt)}`} close={() => setModal(null)}><label className="custom-amount-label">Monto<div className="money-input large"><span>Gs.</span><input type="number" inputMode="numeric" value={customAmount} onChange={(event) => setCustomAmount(Number(event.target.value))} /></div></label><div className="modal-actions"><button className="danger-text" onClick={deleteMovement}>Eliminar</button><button className="primary" disabled={!validAmount(customAmount)} onClick={saveEditedMovement}>Guardar corrección</button></div></Modal>}
      {modal === "close-warning" && <Modal title="La caja no cuadra" subtitle="Revisá los cash-outs antes de finalizar" close={() => setModal(null)}><div className="warning-box"><span>!</span><div><strong>{totals.cashOuts < totals.entered ? "Faltan" : "Sobran"} {money(Math.abs(totals.entered - totals.cashOuts))}</strong><p>Ingresaron {money(totals.entered)} y se registraron {money(totals.cashOuts)} en cash-outs.</p></div></div><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Volver y revisar</button><button className="danger" onClick={finalizeGame}>Finalizar con diferencia</button></div></Modal>}
      {modal === "delete-game" && deleteTarget && <Modal title="Eliminar historial" subtitle="Esta acción elimina la partida del historial" close={() => { if (!deletingGame) setModal(null); }}><div className="warning-box"><span>!</span><div><strong>¿Eliminar {deleteTarget.name}?</strong><p>Se eliminarán sus jugadores, movimientos, cash-outs y resultados. Esta acción no se puede deshacer.</p></div></div><div className="modal-actions"><button className="secondary" disabled={deletingGame} onClick={() => setModal(null)}>Cancelar</button><button className="danger" disabled={deletingGame} onClick={deleteGame}>{deletingGame ? "Eliminando…" : "Sí, eliminar historial"}</button></div>{formError && <p className="form-error" role="alert">{formError}</p>}</Modal>}
      {modal === "settings" && <Modal title="Google Sheets" subtitle={settings.connected ? "La base está conectada" : "Conectá la hoja existente una sola vez"} close={() => setModal(null)}><div className={`connection-state ${settings.connected ? "connected" : ""}`}><span>{settings.connected ? "✓" : "1"}</span><div><strong>{settings.connected ? "Google Sheets conectado" : "Activar el puente seguro"}</strong><p>Usa exclusivamente CasaLindaPoker-Leaderboard y mantiene intactas las pestañas actuales.</p></div></div><ol className="setup-steps"><li><a href="/casa-linda-poker-apps-script.txt" target="_blank">Abrir el código preparado</a> y copiarlo.</li><li>En tu hoja: Extensiones → Apps Script. Pegalo y elegí “Implementar como aplicación web”.</li><li>Usá la misma clave privada en el código y debajo.</li></ol><form className="form-grid" onSubmit={(event) => { event.preventDefault(); saveSettings(event.currentTarget); }}><label className="full">URL de implementación /exec<input name="bridgeUrl" defaultValue={settings.bridgeUrl} placeholder="https://script.google.com/macros/s/…/exec" required /></label><label className="full">Clave privada del puente<input name="bridgeSecret" type="password" autoComplete="new-password" placeholder={settings.connected ? "Ingresá la clave para reconectar" : "Mínimo 12 caracteres"} required /></label>{formError && <p className="form-error full">{formError}</p>}<button className="primary large full" type="submit">Probar, importar y conectar</button></form></Modal>}
    </div>}
  </main>;
}

function AuthModal({ setup, error, close, submit }: { setup: boolean; error: string; close: () => void; submit: (form: HTMLFormElement, setup: boolean) => void }) {
  return <Modal title={setup ? "Crear acceso administrador" : "Acceso administrador"} subtitle={setup ? "Elegí tus credenciales privadas. No se mostrarán a nadie." : "Solo el administrador puede editar la mesa"} close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget, setup); }}><label className="full">Usuario<input name="username" autoComplete="username" autoFocus minLength={3} required /></label><label className="full">Contraseña<input name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={10} required /></label>{setup && <p className="security-note full"><AppIcon name="lock" /> La contraseña se guarda cifrada y nunca se copia a Google Sheets.</p>}{error && <p className="form-error full">{error}</p>}<button className="primary large full" type="submit">{setup ? "Crear administrador" : "Entrar al panel"}</button></form></Modal>;
}

function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: React.ReactNode }) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog?.contains(previousFocus)) dialog?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-description`} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter((element) => element.offsetWidth || element.offsetHeight);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }}><div className="modal-header"><div><h2 id={id}>{title}</h2><p id={`${id}-description`}>{subtitle}</p></div><button type="button" onClick={close} aria-label="Cerrar"><AppIcon name="close" /></button></div>{children}</div>;
}

function MiniPokerTable({ game, avatarUrlForPlayer }: { game: Game; avatarUrlForPlayer: (player: Player) => string | undefined }) {
  const visiblePlayers = game.players.slice(0, 10);
  const seatCount = Math.max(visiblePlayers.length, 1);
  return <section className="poker-table-module" aria-label="Representación de la mesa actual">
    <div className="panel-title table-module-title"><div><span className="section-kicker">MESA ACTUAL</span><h3>Mesa Casa Linda</h3></div><span className="table-suits" aria-hidden="true">♠ <i>♥</i> ♦ ♣</span></div>
    <div className="poker-table-stage">
      <div className="felt-table">
        <img className="playmat-art" src="/playmat-casa-linda.svg" alt="" aria-hidden="true" />
      </div>
      {visiblePlayers.map((player, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / seatCount;
        const sideCount = Math.ceil(seatCount / 2);
        const sideIndex = index < sideCount ? index : index - sideCount;
        const sideTotal = index < sideCount ? sideCount : seatCount - sideCount;
        const style = { "--seat-mobile-x": index < sideCount ? "16%" : "84%", "--seat-mobile-y": `${sideTotal <= 1 ? 50 : 13 + sideIndex * 74 / (sideTotal - 1)}%`, "--seat-x": `${50 + Math.cos(angle) * 38}%`, "--seat-y": `${50 + Math.sin(angle) * 35}%` } as CSSProperties;
        return <div className="table-seat" style={style} key={player.id} title={`${player.nickname || player.name}: ${money(invested(player))}`}>
          <ProfileAvatar name={player.nickname || player.name} url={avatarUrlForPlayer(player)} />
          <span><strong>{player.nickname || player.name}</strong><small>{buyInLabel(invested(player))}</small></span>
        </div>;
      })}
      {game.players.length > visiblePlayers.length && <span className="extra-seats">+{game.players.length - visiblePlayers.length}</span>}
    </div>
  </section>;
}

function SummaryView({ game, canEdit, onChangeMode, avatarUrlForPlayer, onShare, onDownload, onPrint, onReopen }: { game: Game; canEdit: boolean; onChangeMode?: () => void; avatarUrlForPlayer: (player: Player) => string | undefined; onShare: () => void; onDownload: () => void; onPrint: () => void; onReopen: () => void }) {
  const ranking = [...game.players].sort((a, b) => result(b) - result(a)); const winner = ranking[0]; const loser = ranking[ranking.length - 1]; const mostRebuys = [...game.players].sort((a, b) => b.movements.filter((m) => m.type === "rebuy").length - a.movements.filter((m) => m.type === "rebuy").length)[0]; const total = game.players.reduce((sum, player) => sum + invested(player), 0); const maxAbs = Math.max(1, ...ranking.map((player) => Math.abs(result(player))));
  return <section className="summary-page" id="summary-card"><div className="summary-hero"><div><div className="eyebrow"><AppIcon name="trophy" /> Resumen final</div><h1>Resultados de la noche</h1><p>{game.name} · {dateTime(game.startedAt)} · {game.legacy ? "Importada de Google Sheets" : duration(game.startedAt, game.endedAt)}</p></div><div className="summary-actions"><button className="secondary" onClick={onShare}><AppIcon name="share" /> Compartir</button><button className="secondary" onClick={onDownload}><AppIcon name="download" /> Imagen</button><button className="primary" onClick={onPrint}>Guardar PDF</button></div></div><div className="summary-type-control"><span>{modeLabels[game.mode || "chips"]}</span>{onChangeMode && <button className="secondary" onClick={onChangeMode}>Cambiar tipo de partida</button>}</div><div className="winner-card"><div className="winner-avatar-wrap">{winner ? <ProfileAvatar name={winner.nickname || winner.name} url={avatarUrlForPlayer(winner)} large /> : <div className="winner-crown">♛</div>}<span>♛</span></div><div><span>Ganador de la noche</span><h2>{winner?.nickname || winner?.name || "—"}</h2><p>{game.legacy ? "Resultado neto del historial" : winner ? `Con ${money(winner.cashOut ?? 0)} de cash-out` : "Sin resultados"}</p></div><strong>{winner ? `${result(winner) > 0 ? "+" : ""}${money(result(winner))}` : "—"}</strong></div><div className="summary-highlights"><article><span>Mayor pérdida</span><strong>{loser?.nickname || loser?.name || "—"}</strong><b className="negative">{loser ? money(result(loser)) : "—"}</b></article><article><span>Más recompras</span><strong>{game.legacy ? "Sin detalle" : mostRebuys?.nickname || mostRebuys?.name || "—"}</strong><b>{game.legacy ? "Dato no disponible" : mostRebuys ? `${mostRebuys.movements.filter((m) => m.type === "rebuy").length} recompras` : "—"}</b></article><article><span>Total jugado</span><strong>{game.legacy ? "—" : money(total)}</strong><b>{game.players.length} jugadores</b></article><article><span>Duración total</span><strong>{game.legacy ? "Histórica" : duration(game.startedAt, game.endedAt)}</strong><b>{time(game.startedAt)} {game.legacy ? "" : `— ${game.endedAt ? time(game.endedAt) : "En vivo"}`}</b></article></div><div className="results-panel"><div className="panel-title"><div><h3>Ranking de resultados</h3><span>Ganancia y pérdida neta por jugador</span></div></div><div className="ranking-list">{ranking.map((player, index) => { const value = result(player); return <div className="ranking-row" key={player.id}><span className={`rank ${index === 0 ? "first" : ""}`}>{index + 1}</span><div className="cashout-player"><ProfileAvatar name={player.nickname || player.name} url={avatarUrlForPlayer(player)} /><div><strong>{player.nickname || player.name}</strong><small>{game.legacy ? "Resultado importado" : `Invirtió ${money(invested(player))}`}</small></div></div><div className="bar-track"><span className={value >= 0 ? "gain" : "loss"} style={{ width: `${Math.max(6, (Math.abs(value) / maxAbs) * 100)}%` }} /></div><strong className={value > 0 ? "positive" : value < 0 ? "negative" : "neutral"}>{value > 0 ? "+" : ""}{money(value)}</strong></div>; })}</div></div><div className="summary-footer">{canEdit && <button className="secondary" onClick={onReopen}>Reabrir para corregir</button>}<span>{game.mode === "temporary" ? "Temporal: no se guarda. Se pierde al recargar o cerrar." : game.mode === "cash" ? "Guardada en el registro exclusivo CASHGAME." : game.legacy ? "Leída desde CasaLindaPoker-Leaderboard." : "Guardada automáticamente en el historial de fichas."}</span></div></section>;
}

function ProfileAvatar({ name, url, large = false }: { name: string; url?: string; large?: boolean }) {
  const size = large ? 43 : 34;
  return <span className={`avatar ${large ? "" : "small"} profile-avatar`}>{url ? <Image src={url} alt={`Foto de ${name}`} width={size} height={size} unoptimized /> : name.slice(0, 1).toUpperCase()}</span>;
}
