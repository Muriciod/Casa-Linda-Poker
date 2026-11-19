import { useSyncExternalStore } from "react";

export function duration(startedAt: string, endedAt?: string | null, now = Date.now()) {
  const minutes = Math.max(0, Math.floor(((endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt)) / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

// One clock for all visible live durations. Closed sessions need no subscription.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: number | undefined;
function tick() { now = Date.now(); listeners.forEach(update => update()); }
function syncVisibility() {
  window.clearInterval(timer);
  if (!document.hidden) { tick(); timer = window.setInterval(tick, 60000); }
}
function subscribe(update: () => void) {
  listeners.add(update);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
  }
  return () => {
    listeners.delete(update);
    if (!listeners.size) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncVisibility);
    }
  };
}
const snapshot = () => now;
const serverSnapshot = () => 0;
function LiveTime({ start }: { start: string }) {
  const time = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <>{time ? duration(start, null, time) : "—"}</>;
}
export default function ElapsedTime({start, end}: { start: string; end?: string | null }) {
  return end ? <>{duration(start, end)}</> : <LiveTime start={start} />;
}
