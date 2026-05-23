import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { effectiveTemplateVisibility, ensureSeedConfigs, listDocs } from 'lib/config-service';
import { readAppData, updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;

  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind');
  const kind = kindParam === 'rules' || kindParam === 'board' || kindParam === 'cards' || kindParam === 'template' ? kindParam : null;
  if (kindParam && !kind) return NextResponse.json({ error: 'INVALID_KIND' }, { status: 400 });

  const data = await readAppData();
  const full = data.configDocs['builtin:board-full'];
  const sysTpl = data.configDocs['system:template-standard'];
  const legacyTpl = data.configDocs['builtin:template-standard'];
  const hasDefaultTpl = !!(sysTpl?.publishedVersionId || legacyTpl?.publishedVersionId);
  if (!Object.keys(data.configDocs).length || !full || !full.publishedVersionId || !hasDefaultTpl) {
    await updateAppData((d) => {
      ensureSeedConfigs(d, Date.now());
    });
  }

  const data2 = await readAppData();
  const hiddenTemplateDocIds = new Set(['system:template-standard', 'builtin:template-standard']);
  const docs = listDocs(data2, kind ?? undefined)
    .map((d) => {
      if (d.kind === 'template' && hiddenTemplateDocIds.has(d.docId)) return null;
      if (d.kind === 'template') {
        const visibility = effectiveTemplateVisibility(d);
        const isOwner = !!(uid && d.ownerId === uid);
        const canShow = isOwner || (visibility === 'public' && !!d.publishedVersionId);
        if (!canShow) return null;
        return {
          docId: d.docId,
          kind: d.kind,
          name: d.name,
          visibility,
          createdAtMs: d.createdAtMs,
          updatedAtMs: d.updatedAtMs,
          publishedVersionId: d.publishedVersionId,
          draftVersionId: d.draftVersionId,
        };
      }
      return {
        docId: d.docId,
        kind: d.kind,
        name: d.name,
        createdAtMs: d.createdAtMs,
        updatedAtMs: d.updatedAtMs,
        publishedVersionId: d.publishedVersionId,
        draftVersionId: d.draftVersionId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ docs });
}
