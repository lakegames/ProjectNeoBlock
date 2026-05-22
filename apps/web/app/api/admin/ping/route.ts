import { NextResponse } from 'next/server';

import { requireAdmin } from 'lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  return NextResponse.json({ ok: true, uid: auth.uid, org: auth.org });
}

