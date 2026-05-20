import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type SessionLike = { user?: { id?: string; name?: string | null; email?: string | null } } | null;

function getUid(session: SessionLike) {
  return session?.user?.id;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = getUid(session);
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const result = await updateAppData((data) => {
    const now = new Date().toISOString();
    const existing = data.profiles[uid];
    if (!existing) {
      const fallback =
        session?.user?.name?.trim() || session?.user?.email?.trim() || uid.split(':').at(-1) || '玩家';
      data.profiles[uid] = { id: uid, displayName: fallback, createdAt: now, updatedAt: now };
    }
    return {
      profile: data.profiles[uid],
      friends: data.friends[uid] ?? [],
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = getUid(session);
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { displayName?: string } | null;
  const displayName = body?.displayName?.trim();
  if (!displayName || displayName.length > 40) {
    return NextResponse.json({ error: 'INVALID_DISPLAY_NAME' }, { status: 400 });
  }

  const result = await updateAppData((data) => {
    const now = new Date().toISOString();
    const existing = data.profiles[uid];
    if (!existing) {
      data.profiles[uid] = { id: uid, displayName, createdAt: now, updatedAt: now };
    } else {
      existing.displayName = displayName;
      existing.updatedAt = now;
    }
    return { profile: data.profiles[uid] };
  });

  return NextResponse.json(result);
}
