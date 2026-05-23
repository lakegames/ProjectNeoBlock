"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button, RoomCard } from '@neoblock/ui';

type MatchListItem = {
  id: string;
  roomCode: string;
  status: 'ended';
  createdAtMs: number;
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  hostDisplayName: string;
  playerCount: number;
  spectatorCount: number;
};

export default function HistoryPage() {
  const [records, setRecords] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch('/api/match/list', { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'LIST_FAILED');
      setRecords((json.records ?? []) as MatchListItem[]);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  async function hideRecord(id: string) {
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      const r = await fetch('/api/match/hide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error((json as { error?: string } | null)?.error || 'HIDE_FAILED');
      await refresh();
    } catch {
      void 0;
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1240 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>历史对局</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/">
            <Button mode="Second">返回首页</Button>
          </Link>
          <Button onClick={refresh} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {records.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {records.map((r) => (
              <RoomCard
                key={r.id}
                roomCode={r.roomCode}
                status={r.status}
                createdAtMs={r.createdAtMs}
                maxPlayers={r.maxPlayers}
                turnTimeSec={r.turnTimeSec}
                enableAuto={r.enableAuto}
                enableAI={r.enableAI}
                hostDisplayName={r.hostDisplayName}
                playerCount={r.playerCount}
                spectatorCount={r.spectatorCount}
                actions={
                  <>
                    <Link href={`/room/${encodeURIComponent(r.roomCode)}?spectate=1`}>
                      <Button size="sm" mode="Second">
                        观战
                      </Button>
                    </Link>
                    <Button size="sm" mode="Second" onClick={() => hideRecord(r.id)} loading={deletingId === r.id}>
                      删除
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        ) : (
          <div style={{ color: 'rgba(0,0,0,0.65)' }}>暂无历史对局</div>
        )}
      </div>
    </main>
  );
}
