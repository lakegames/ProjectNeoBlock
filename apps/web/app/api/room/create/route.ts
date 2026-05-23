import { NextResponse } from 'next/server';

import { proxyAppDataApi } from 'lib/appdata-proxy';
import { encodeGuestIdentity, guestCookieName, type GuestIdentity } from 'lib/identity';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { status, body } = await proxyAppDataApi(req, '/api/room/create');
  const payload = (body ?? null) as { newGuest?: GuestIdentity | null } | null;
  const newGuest = payload?.newGuest;

  if (newGuest && typeof newGuest.id === 'string' && typeof newGuest.nickname === 'string') {
    const { newGuest: _, ...rest } = payload as { newGuest: GuestIdentity } & Record<string, unknown>;
    const res = NextResponse.json(rest, { status });
    res.cookies.set(guestCookieName, encodeGuestIdentity(newGuest), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  if (payload && typeof payload === 'object' && 'newGuest' in payload) {
    const { newGuest: _, ...rest } = payload as Record<string, unknown>;
    return NextResponse.json(rest, { status });
  }

  return NextResponse.json(body, { status });
}
