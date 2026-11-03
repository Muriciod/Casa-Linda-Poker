import { getSetting } from "./app-storage";

async function bridgeConfig() {
  const [url, secret] = await Promise.all([getSetting("sheets_bridge_url"), getSetting("sheets_bridge_secret")]);
  return url && secret ? { url, secret } : null;
}

export async function testSheetsBridge(url: string, secret: string) {
  const endpoint = new URL(url);
  endpoint.searchParams.set("action", "ping");
  endpoint.searchParams.set("secret", secret);
  const response = await fetch(endpoint, { redirect: "follow" });
  const payload = await response.json() as { ok?: boolean; sheetId?: string };
  if (!response.ok || !payload.ok) throw new Error("No se pudo validar la conexión con Google Sheets");
  return payload;
}

export async function fetchSheetsSnapshot(url: string, secret: string) {
  const endpoint = new URL(url);
  endpoint.searchParams.set("action", "snapshot");
  endpoint.searchParams.set("secret", secret);
  const response = await fetch(endpoint, { redirect: "follow" });
  const payload = await response.json() as { ok?: boolean; games?: unknown[]; roster?: unknown[]; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo importar Google Sheets");
  return payload;
}

export async function syncSheetsSnapshot(games: unknown[], roster: unknown[]) {
  const config = await bridgeConfig();
  if (!config) return { synced: false };
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "saveSnapshot", secret: config.secret, games, roster }),
    redirect: "follow",
  });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo sincronizar Google Sheets");
  return { synced: true };
}

export async function deleteSheetsGame(gameId: string) {
  const config = await bridgeConfig();
  if (!config) return;
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deleteGame", secret: config.secret, gameId }),
    redirect: "follow",
  });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo eliminar la partida de Google Sheets");
}
