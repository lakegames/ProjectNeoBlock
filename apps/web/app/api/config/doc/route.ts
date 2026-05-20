import { NextResponse } from 'next/server';

import { createNewDoc, ensureSeedConfigs } from 'lib/config-service';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = { kind?: 'rules' | 'board' | 'cards'; name?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const kind = body?.kind;
  const name = (body?.name ?? '').trim();
  if (!kind || (kind !== 'rules' && kind !== 'board' && kind !== 'cards')) return NextResponse.json({ error: 'INVALID_KIND' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 });

  const nowMs = Date.now();
  const result = await updateAppData((data) => {
    ensureSeedConfigs(data, nowMs);
    const doc = createNewDoc(data, { kind, name, nowMs });
    return { ok: true as const, doc };
  });
  return NextResponse.json(result);
}

