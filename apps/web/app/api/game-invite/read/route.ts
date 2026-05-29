import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "lib/auth";
import { updateAppData } from "lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

  const result = await updateAppData((data) => {
    const msg = (data.gameInvites ?? []).find((x) => x.id === id) ?? null;
    if (!msg || msg.toUid !== uid)
      return { ok: false as const, error: "NOT_FOUND" as const };
    if (!msg.readAtMs) msg.readAtMs = Date.now();
    return { ok: true as const };
  });

  if (!result.ok) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
