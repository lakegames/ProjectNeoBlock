import crypto from 'node:crypto';

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const origin = req.headers.get('origin') ?? '';

  const result = await updateAppData((data) => {
    const now = new Date().toISOString();
    let code = generateCode();
    while (data.invites[code]) {
      code = generateCode();
    }
    data.invites[code] = { code, inviterId: uid, createdAt: now };
    return { code, link: origin ? `${origin}/invite/${code}` : `/invite/${code}` };
  });

  return NextResponse.json(result);
}
