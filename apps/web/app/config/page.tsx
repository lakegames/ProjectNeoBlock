"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button, Input } from '@neoblock/ui';

type DocListItem = {
  docId: string;
  kind: 'rules' | 'board' | 'cards';
  name: string;
  createdAtMs: number;
  updatedAtMs: number;
  publishedVersionId: string | null;
  draftVersionId: string;
};

export default function ConfigHomePage() {
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createKind, setCreateKind] = useState<'rules' | 'board' | 'cards'>('rules');
  const [createName, setCreateName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/config/list', { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'LOAD_FAILED');
      setDocs((json.docs ?? []) as DocListItem[]);
    } catch (e) {
      setError(String((e as Error).message || e));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<'rules' | 'board' | 'cards', DocListItem[]> = { rules: [], board: [], cards: [] };
    for (const d of docs) g[d.kind].push(d);
    return g;
  }, [docs]);

  async function createDoc() {
    if (createLoading) return;
    const name = createName.trim();
    if (!name) {
      setCreateError('名称不能为空');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const r = await fetch('/api/config/doc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: createKind, name }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'CREATE_FAILED');
      setCreateName('');
      await refresh();
    } catch (e) {
      setCreateError(String((e as Error).message || e));
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: 0 }}>配置管理</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>规则 / 棋盘 / 卡牌 配置与版本化（草稿 / 发布 / 回滚）</p>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
        <Button onClick={refresh} disabled={loading}>
          {loading ? '刷新中…' : '刷新列表'}
        </Button>
      </div>

      <section style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 700 }}>新建配置文档</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={createKind}
            onChange={(e) => setCreateKind(e.target.value as 'rules' | 'board' | 'cards')}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              minWidth: 160,
            }}
          >
            <option value="rules">规则</option>
            <option value="board">棋盘</option>
            <option value="cards">卡牌</option>
          </select>
          <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="名称，例如：标准规则 v2" style={{ minWidth: 280 }} />
          <Button onClick={createDoc} disabled={createLoading}>
            {createLoading ? '创建中…' : '创建'}
          </Button>
        </div>
        {createError ? <div style={{ marginTop: 10, color: '#b42318' }}>{createError}</div> : null}
      </section>

      <section style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 700 }}>配置文档</div>
        <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)' }}>点击进入后编辑草稿，发布后可用于创建房间</div>

        {(['rules', 'board', 'cards'] as const).map((k) => {
          const list = grouped[k];
          const title = k === 'rules' ? '规则' : k === 'board' ? '棋盘' : '卡牌';
          return (
            <div key={k} style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700 }}>{title}</div>
              <div style={{ marginTop: 8 }}>
                {list.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {list.map((d) => (
                      <li key={d.docId} style={{ marginTop: 8 }}>
                        <span style={{ fontWeight: 700 }}>{d.name}</span>（{d.docId}）
                        <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.65)' }}>
                          ｜发布 {d.publishedVersionId ? d.publishedVersionId : '-'} ｜草稿 {d.draftVersionId}
                        </span>
                        <Link href={`/config/${d.docId}`}>
                          <Button style={{ marginLeft: 10 }}>进入</Button>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: 'rgba(0,0,0,0.65)' }}>暂无</div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
    </main>
  );
}
