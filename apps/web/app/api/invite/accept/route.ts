import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: 'INVALID_CODE' }, { status: 400 });

  const result = await updateAppData((data) => {
    const invite = data.invites[code];
    if (!invite) return { ok: false as const, error: 'NOT_FOUND' as const };
    const nowMs = Date.now();
    const expiresAtMs = invite.expiresAt && Number.isFinite(Date.parse(invite.expiresAt)) ? Date.parse(invite.expiresAt) : null;
    if (expiresAtMs !== null && nowMs > expiresAtMs) return { ok: false as const, error: 'EXPIRED' as const };

    const maxUses = typeof invite.maxUses === 'number' && Number.isFinite(invite.maxUses) ? Math.trunc(invite.maxUses) : 1;
    const uses = typeof invite.uses === 'number' && Number.isFinite(invite.uses) ? Math.trunc(invite.uses) : invite.usedBy ? 1 : 0;
    if (uses >= maxUses) return { ok: false as const, error: 'ALREADY_USED' as const };
    if (invite.inviterId === uid) return { ok: false as const, error: 'CANNOT_ACCEPT_SELF' as const };

    const now = new Date().toISOString();
    invite.uses = uses + 1;
    if (maxUses === 1) {
      invite.usedBy = uid;
      invite.usedAt = now;
    }

    data.friends[invite.inviterId] = Array.from(
      new Set([...(data.friends[invite.inviterId] ?? []), uid]),
    );
    data.friends[uid] = Array.from(new Set([...(data.friends[uid] ?? []), invite.inviterId]));

    return { ok: true as const, inviterId: invite.inviterId };
  });

  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
