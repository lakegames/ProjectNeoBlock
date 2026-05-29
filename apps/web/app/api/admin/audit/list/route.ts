import { NextResponse } from "next/server";

import { requireAdmin } from "lib/admin-auth";
import { readAppData } from "lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const limit = Math.max(
    1,
    Math.min(500, Number(url.searchParams.get("limit") ?? "200") || 200),
  );

  const data = await readAppData();
  const audit = [...data.audit].sort((a, b) => b.atMs - a.atMs).slice(0, limit);
  return NextResponse.json({ audit });
}
