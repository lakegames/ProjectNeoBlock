"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button, Input } from '@neoblock/ui';

import { validateBoardConfig, validateCardsConfig, validateRulesConfig, type ConfigIssue } from 'lib/config';

type VersionSummary = {
  versionId: string;
  status: 'draft' | 'published' | 'archived';
  createdAtMs: number;
  updatedAtMs: number;
  baseVersionId: string | null;
  note: string | null;
};

type ConfigDocResponse = {
  doc: {
    docId: string;
    kind: 'rules' | 'board' | 'cards';
    name: string;
    createdAtMs: number;
    updatedAtMs: number;
    publishedVersionId: string | null;
    draftVersionId: string;
    versions: VersionSummary[];
  };
  draft: { versionId: string; data: unknown; updatedAtMs: number } | null;
  published: { versionId: string; data: unknown; updatedAtMs: number } | null;
};

function formatTime(ms: number) {
  return new Date(ms).toLocaleString('zh-CN');
}

function Preview({ kind, data }: { kind: 'rules' | 'board' | 'cards'; data: unknown }) {
  const summary = useMemo(() => {
    if (kind === 'rules') {
      const r = validateRulesConfig(data);
      if (!r.ok) return null;
      const v = r.value;
      return [
        `初始现金：${v.initialCash}`,
        `过起点工资：${v.startSalary}`,
        `监狱罚金：${v.jailFine}`,
        `抵押利率：${v.mortgageInterestRate}`,
        `银行房子：${v.bankHouses}`,
        `银行旅馆：${v.bankHotels}`,
      ];
    }
    if (kind === 'board') {
      const r = validateBoardConfig(data);
      if (!r.ok) return null;
      const tiles = r.value.tiles;
      const props = tiles.filter((t) => t.kind === 'property');
      const chance = tiles.filter((t) => t.kind === 'chance').length;
      const chest = tiles.filter((t) => t.kind === 'communityChest').length;
      const tax = tiles.filter((t) => t.kind === 'tax').length;
      const goToJail = tiles.filter((t) => t.kind === 'goToJail').length;
      const groups = new Set(props.map((p) => p.groupId));
      return [
        `格子数：${tiles.length}`,
        `监狱索引：${r.value.jailIndex}`,
        `地产：${props.length}（组数：${groups.size}）`,
        `机会：${chance}｜命运：${chest}｜税收：${tax}｜进监狱：${goToJail}`,
      ];
    }
    const r = validateCardsConfig(data);
    if (!r.ok) return null;
    const cards = r.value.cards;
    const chance = cards.filter((c) => c.deck === 'chance').length;
    const chest = cards.filter((c) => c.deck === 'communityChest').length;
    const effects = new Set(cards.map((c) => c.effect.kind));
    return [`卡牌总数：${cards.length}`, `机会：${chance}｜命运：${chest}`, `效果类型：${[...effects].join('、') || '-'}`];
  }, [data, kind]);

  if (!summary) return <div style={{ color: '#b42318' }}>预览不可用：配置未通过校验</div>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {summary.map((s) => (
        <li key={s} style={{ marginTop: 6 }}>
          {s}
        </li>
      ))}
    </ul>
  );
}

function Issues({ issues }: { issues: ConfigIssue[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: '#b42318' }}>
      {issues.slice(0, 20).map((i) => (
        <li key={`${i.path}:${i.message}`} style={{ marginTop: 6 }}>
          {i.path || '(root)'}：{i.message}
        </li>
      ))}
    </ul>
  );
}

export default function ConfigDocPage() {
  const params = useParams<{ docId: string }>();
  const docId = useMemo(() => {
    let v = String(params?.docId || '');
    for (let i = 0; i < 2; i += 1) {
      if (!v.includes('%')) break;
      try {
        const d = decodeURIComponent(v);
        if (d === v) break;
        v = d;
      } catch {
        break;
      }
    }
    return v;
  }, [params]);

  const [data, setData] = useState<ConfigDocResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveIssues, setSaveIssues] = useState<ConfigIssue[] | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [rollbackTarget, setRollbackTarget] = useState<string>('');
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const [rulesForm, setRulesForm] = useState({
    initialCash: 1500,
    startSalary: 200,
    jailFine: 50,
    mortgageInterestRate: 0.1,
    bankHouses: 32,
    bankHotels: 12,
  });
  const [jsonText, setJsonText] = useState('');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);

  async function refresh() {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/config/get?docId=${encodeURIComponent(docId)}`, { cache: 'no-store' });
      const json = (await r.json()) as ConfigDocResponse;
      if (!r.ok) throw new Error((json as unknown as { error?: string }).error || 'LOAD_FAILED');
      setData(json);

      if (json.doc.kind === 'rules') {
        const vr = validateRulesConfig(json.draft?.data ?? null);
        if (vr.ok) setRulesForm(vr.value);
      } else if (json.doc.kind === 'board') {
        setJsonText(JSON.stringify(json.draft?.data ?? null, null, 2));
      } else {
        setJsonText(JSON.stringify(json.draft?.data ?? null, null, 2));
      }
      setRollbackTarget('');
      setSaveIssues(null);
      setJsonParseError(null);
    } catch (e) {
      setError(String((e as Error).message || e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [docId]);

  const kind = data?.doc.kind ?? null;
  const publishedData = data?.published?.data ?? null;

  const rollbackCandidates = useMemo(() => {
    if (!data) return [];
    return data.doc.versions.filter((v) => v.status !== 'draft');
  }, [data]);

  const draftValidation = useMemo(() => {
    if (!kind) return null;
    if (kind === 'rules') return validateRulesConfig(rulesForm);
    if (jsonParseError) return { ok: false as const, issues: [{ path: 'json', message: jsonParseError }] };
    try {
      const parsed = JSON.parse(jsonText);
      return kind === 'board' ? validateBoardConfig(parsed) : validateCardsConfig(parsed);
    } catch (e) {
      return { ok: false as const, issues: [{ path: 'json', message: String((e as Error).message || e) }] };
    }
  }, [jsonParseError, jsonText, kind, rulesForm]);

  useEffect(() => {
    if (!kind || kind === 'rules') return;
    try {
      JSON.parse(jsonText);
      setJsonParseError(null);
    } catch (e) {
      setJsonParseError(String((e as Error).message || e));
    }
  }, [jsonText, kind]);

  async function saveDraft() {
    if (!data || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveIssues(null);
    try {
      if (!draftValidation || !draftValidation.ok) {
        setSaveIssues(draftValidation ? (draftValidation as { ok: false; issues: ConfigIssue[] }).issues : [{ path: '', message: '校验失败' }]);
        return;
      }
      const draftDataToSave = draftValidation.value;
      const r = await fetch('/api/config/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId: data.doc.docId, draftData: draftDataToSave }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'SAVE_FAILED');
      await refresh();
    } catch (e) {
      setSaveError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!data || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const r = await fetch('/api/config/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId: data.doc.docId }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'PUBLISH_FAILED');
      await refresh();
    } catch (e) {
      setPublishError(String((e as Error).message || e));
    } finally {
      setPublishing(false);
    }
  }

  async function rollback() {
    if (!data || rollbackLoading) return;
    const targetVersionId = rollbackTarget.trim();
    if (!targetVersionId) return;
    setRollbackLoading(true);
    setRollbackError(null);
    try {
      const r = await fetch('/api/config/rollback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId: data.doc.docId, targetVersionId }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'ROLLBACK_FAILED');
      await refresh();
    } catch (e) {
      setRollbackError(String((e as Error).message || e));
    } finally {
      setRollbackLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1040 }}>
      <h1 style={{ margin: 0 }}>配置详情</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>草稿可编辑并校验，发布后可用于创建房间；回滚会生成新的“发布版本”</p>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/config">
          <Button>返回列表</Button>
        </Link>
        <Button onClick={refresh} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </div>

      {data ? (
        <section style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
          <div style={{ fontWeight: 800 }}>{data.doc.name}</div>
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
            docId: {data.doc.docId} ｜kind: {data.doc.kind} ｜草稿: {data.doc.draftVersionId} ｜发布: {data.doc.publishedVersionId ?? '-'}
          </div>
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>更新于：{formatTime(data.doc.updatedAtMs)}</div>
        </section>
      ) : null}

      {kind ? (
        <section style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
          <div style={{ fontWeight: 800 }}>草稿编辑</div>
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>保存只更新草稿；发布会从草稿生成不可变快照</div>

          {kind === 'rules' ? (
            <div style={{ marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>初始现金</div>
                <Input value={String(rulesForm.initialCash)} onChange={(e) => setRulesForm((s) => ({ ...s, initialCash: Number(e.target.value) }))} type="number" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>过起点工资</div>
                <Input value={String(rulesForm.startSalary)} onChange={(e) => setRulesForm((s) => ({ ...s, startSalary: Number(e.target.value) }))} type="number" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>监狱罚金</div>
                <Input value={String(rulesForm.jailFine)} onChange={(e) => setRulesForm((s) => ({ ...s, jailFine: Number(e.target.value) }))} type="number" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>抵押利率（0-1）</div>
                <Input
                  value={String(rulesForm.mortgageInterestRate)}
                  onChange={(e) => setRulesForm((s) => ({ ...s, mortgageInterestRate: Number(e.target.value) }))}
                  type="number"
                  step="0.01"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>银行房子</div>
                <Input value={String(rulesForm.bankHouses)} onChange={(e) => setRulesForm((s) => ({ ...s, bankHouses: Number(e.target.value) }))} type="number" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>银行旅馆</div>
                <Input value={String(rulesForm.bankHotels)} onChange={(e) => setRulesForm((s) => ({ ...s, bankHotels: Number(e.target.value) }))} type="number" />
              </label>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 320,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.12)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 13,
                  lineHeight: '20px',
                }}
              />
              <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>提示：此处编辑 JSON；保存/发布会进行结构校验</div>
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={saveDraft} disabled={saving}>
              {saving ? '保存中…' : '保存草稿'}
            </Button>
            <Button onClick={publish} disabled={publishing || !data?.doc.docId}>
              {publishing ? '发布中…' : '发布'}
            </Button>
          </div>

          {saveIssues ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, color: '#b42318' }}>校验错误</div>
              <div style={{ marginTop: 8 }}>
                <Issues issues={saveIssues} />
              </div>
            </div>
          ) : null}
          {saveError ? <div style={{ marginTop: 10, color: '#b42318' }}>{saveError}</div> : null}
          {publishError ? <div style={{ marginTop: 10, color: '#b42318' }}>{publishError}</div> : null}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800 }}>草稿预览</div>
            <div style={{ marginTop: 10 }}>{draftValidation && draftValidation.ok ? <Preview kind={kind} data={draftValidation.value} /> : <div style={{ color: '#b42318' }}>草稿未通过校验</div>}</div>
          </div>
        </section>
      ) : null}

      {data ? (
        <section style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
          <div style={{ fontWeight: 800 }}>已发布版本</div>
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
            当前发布：{data.doc.publishedVersionId ?? '-'} {data.published ? `（更新于 ${formatTime(data.published.updatedAtMs)}）` : ''}
          </div>
          <div style={{ marginTop: 10 }}>{publishedData ? <Preview kind={data.doc.kind} data={publishedData} /> : <div style={{ color: 'rgba(0,0,0,0.65)' }}>暂无发布版本</div>}</div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={rollbackTarget}
              onChange={(e) => setRollbackTarget(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.12)',
                background: '#fff',
                minWidth: 320,
              }}
            >
              <option value="">选择要回滚到的历史版本…</option>
              {rollbackCandidates.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {v.versionId}｜{v.status}｜{formatTime(v.createdAtMs)}{v.note ? `｜${v.note}` : ''}
                </option>
              ))}
            </select>
            <Button onClick={rollback} disabled={!rollbackTarget || rollbackLoading}>
              {rollbackLoading ? '回滚中…' : '回滚为当前发布'}
            </Button>
          </div>
          {rollbackError ? <div style={{ marginTop: 10, color: '#b42318' }}>{rollbackError}</div> : null}
        </section>
      ) : null}

      {data ? (
        <section style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
          <div style={{ fontWeight: 800 }}>版本历史</div>
          <div style={{ marginTop: 10 }}>
            {data.doc.versions.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.doc.versions
                  .slice()
                  .sort((a, b) => b.createdAtMs - a.createdAtMs)
                  .map((v) => (
                    <li key={v.versionId} style={{ marginTop: 8 }}>
                      <span style={{ fontWeight: 700 }}>{v.versionId}</span> ｜{v.status}｜{formatTime(v.createdAtMs)}
                      {v.baseVersionId ? `｜base:${v.baseVersionId}` : ''}
                      {v.note ? `｜${v.note}` : ''}
                    </li>
                  ))}
              </ul>
            ) : (
              <div style={{ color: 'rgba(0,0,0,0.65)' }}>暂无</div>
            )}
          </div>
        </section>
      ) : null}

      {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
    </main>
  );
}
