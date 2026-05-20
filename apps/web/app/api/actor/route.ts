import { NextResponse } from 'next/server';

import { encodeGuestIdentity, guestCookieName } from 'lib/identity';
import { normalizeDisplayName, resolveActor } from 'lib/room';

export const runtime = 'nodejs';

export async function GET() {
  const actor = await resolveActor({ allowGuestCreate: false });
  if (!actor) return NextResponse.json({ actor: null });
  return NextResponse.json({
    actor: {
      kind: actor.kind,
      playerId: actor.playerId,
      displayName: actor.displayName,
      ...(actor.kind === 'user' ? { userId: actor.userId } : {}),
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { nickname?: string } | null;
  const nickname = normalizeDisplayName(body?.nickname || '游客');
  if (!nickname) return NextResponse.json({ error: 'INVALID_NICKNAME' }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: true, nickname });
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const res = NextResponse.json({
    actor: {
      kind: actor.kind,
      playerId: actor.playerId,
      displayName: actor.displayName,
      ...(actor.kind === 'user' ? { userId: actor.userId } : {}),
    },
  });
  if (actor.kind === 'guest' && actor.newGuest) {
    res.cookies.set(guestCookieName, encodeGuestIdentity(actor.newGuest), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

