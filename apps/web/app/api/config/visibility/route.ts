import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "lib/auth";
import { ensureSeedConfigs } from "lib/config-service";
import { updateAppData } from "lib/store";

export const runtime = "nodejs";

type Body = { docId?: string; visibility?: "private" | "public" };

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const docId = body?.docId?.trim() ?? "";
  const visibility = body?.visibility;
  if (!docId)
    return NextResponse.json({ error: "INVALID_DOC_ID" }, { status: 400 });
  if (visibility !== "private" && visibility !== "public")
    return NextResponse.json({ error: "INVALID_VISIBILITY" }, { status: 400 });

  const nowMs = Date.now();
  const result = await updateAppData((data) => {
    ensureSeedConfigs(data, nowMs);
    const doc = data.configDocs[docId];
    if (!doc) return { ok: false as const, error: "DOC_NOT_FOUND" as const };
    if (doc.kind !== "template")
      return { ok: false as const, error: "NOT_TEMPLATE" as const };

    if (typeof doc.ownerId === "undefined") doc.ownerId = uid;
    if (doc.ownerId !== uid)
      return { ok: false as const, error: "FORBIDDEN" as const };

    doc.visibility = visibility;
    doc.updatedAtMs = nowMs;
    return {
      ok: true as const,
      doc: {
        docId: doc.docId,
        kind: doc.kind,
        visibility: doc.visibility,
        updatedAtMs: doc.updatedAtMs,
      },
    };
  });

  if (!result.ok) {
    const status =
      result.error === "DOC_NOT_FOUND"
        ? 404
        : result.error === "FORBIDDEN"
          ? 403
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
