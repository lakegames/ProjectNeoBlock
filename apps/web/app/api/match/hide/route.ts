import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });

  const selfPlayerId = `user:${uid}`;
  const result = await updateAppData((data) => {
    const record = (data.matchRecords ?? []).find((x) => x.id === id) ?? null;
    if (!record) return { ok: false as const, error: 'NOT_FOUND' as const };
    const isParticipant = record.participants.some((p) => p.userId === uid || p.playerId === selfPlayerId);
    if (!isParticipant) return { ok: false as const, error: 'FORBIDDEN' as const };
    record.hiddenByUids ??= [];
    if (!record.hiddenByUids.includes(uid)) record.hiddenByUids.push(uid);
    return { ok: true as const };
  });

  if (!result.ok) {
    const status = result.error === 'NOT_FOUND' ? 404 : result.error === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

