export type ActiveGame = {
  roomCode: string;
  updatedAtMs: number;
};

const storageKey = "nb_active_game";
export const activeGameTtlMs = 2 * 60 * 60 * 1000;

export function readActiveGame(nowMs = Date.now()): ActiveGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveGame>;
    const roomCode =
      typeof parsed.roomCode === "string"
        ? parsed.roomCode.trim().toUpperCase()
        : "";
    const updatedAtMs =
      typeof parsed.updatedAtMs === "number" &&
      Number.isFinite(parsed.updatedAtMs)
        ? parsed.updatedAtMs
        : 0;
    if (!roomCode || !updatedAtMs) return null;
    if (nowMs - updatedAtMs > activeGameTtlMs) return null;
    return { roomCode, updatedAtMs };
  } catch {
    return null;
  }
}

export function writeActiveGame(roomCode: string, nowMs = Date.now()) {
  if (typeof window === "undefined") return;
  const code = roomCode.trim().toUpperCase();
  if (!code) return;
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ roomCode: code, updatedAtMs: nowMs } satisfies ActiveGame),
  );
}

export function clearActiveGame() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
}
