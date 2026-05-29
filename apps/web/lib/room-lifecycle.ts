import type { Room } from "./store";

export const roomEmptyCloseMs = 3 * 60 * 1000;
export const roomArchivedTtlMs = 30 * 24 * 60 * 60 * 1000;

export function shouldCloseRoomByEmpty(room: Room, nowMs: number) {
  if (room.closedAtMs) return false;
  if (room.members.length) return false;
  if (!room.emptySinceMs) return false;
  return nowMs - room.emptySinceMs >= roomEmptyCloseMs;
}

export function applyRoomAutoClose(room: Room, nowMs: number) {
  if (room.closedAtMs) return;
  if (room.members.length) {
    if (room.emptySinceMs) delete room.emptySinceMs;
    return;
  }
  if (!room.emptySinceMs) {
    room.emptySinceMs = nowMs;
    return;
  }
  if (nowMs - room.emptySinceMs >= roomEmptyCloseMs) {
    room.closedAtMs = nowMs;
  }
}
