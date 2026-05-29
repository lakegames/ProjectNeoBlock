import { cookies } from "next/headers";

export type GuestIdentity = {
  id: string;
  nickname: string;
};

const cookieName = "nb_guest";

export function getGuestIdentity(): GuestIdentity | null {
  const raw = cookies().get(cookieName)?.value;
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as GuestIdentity;
    if (!parsed.id || !parsed.nickname) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeGuestIdentity(identity: GuestIdentity) {
  return Buffer.from(JSON.stringify(identity), "utf8").toString("base64url");
}

export const guestCookieName = cookieName;
