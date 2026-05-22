"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Button } from '@neoblock/ui';

type AdminRoom = {
  roomCode: string;
  roomId: string;
  status: 'lobby' | 'playing' | 'ended';
  createdAtMs: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  closedAtMs: number | null;
  hostPlayerId: string;
  hostDisplayName: string;
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  playerCount: number;
  spectatorCount: number;
  members: Array<{
    playerId: string;
    userId?: string;
    displayName: string;
    isSpectator: boolean;
    ready: boolean;
    joinedAtMs: number;
  }>;
};

type AdminUser = {
  id: string;
  displayName: string;
  avatarKind: 'custom' | 'github' | 'none';
  avatarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  friendCount: number;
  roomCount: number;
};

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return '?';
  const last = s.at(-1);
  return last ? last.toUpperCase() : '?';
}

type AuditEntry = {
  id: string;
  atMs: number;
  actorUid: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
};

async function apiJson<T>(url: string) {
  const r = await fetch(url, { cache: 'no-store' });
  const json = (await r.json().catch(() => null)) as T | null;
  if (!r.ok) throw new Error(String((json as { error?: unknown } | null)?.error || r.status));
  return json as T;
}

async function apiPost<T>(url: string, body: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => null)) as T | null;
  if (!r.ok) throw new Error(String((json as { error?: unknown } | null)?.error || r.status));
  return json as T;
}

function fmtMs(ms: number | null) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

export default function AdminPage() {
  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [adminOk, setAdminOk] = useState<boolean | null>(null);
  const [adminInfo, setAdminInfo] = useState<{ uid: string; org: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'rooms' | 'users' | 'audit'>('rooms');

  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>('');
  const selectedRoom = useMemo(() => rooms.find((r) => r.roomCode === selectedRoomCode) ?? null, [rooms, selectedRoomCode]);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    setAdminOk(null);
    setAdminInfo(null);
    if (!uid) return;
    apiJson<{ ok: true; uid: string; org: string }>('/api/admin/ping')
      .then((res) => {
        setAdminOk(true);
        setAdminInfo({ uid: res.uid, org: res.org });
      })
      .catch((e) => {
        setAdminOk(false);
        setError(String((e as Error).message || e));
      });
  }, [uid]);

  async function refreshRooms() {
    const res = await apiJson<{ rooms: AdminRoom[] }>('/api/admin/room/list?includeClosed=1');
    setRooms(res.rooms);
    if (selectedRoomCode && !res.rooms.some((r) => r.roomCode === selectedRoomCode)) setSelectedRoomCode('');
  }

  async function refreshUsers() {
    const res = await apiJson<{ users: AdminUser[] }>('/api/admin/user/list');
    setUsers(res.users);
  }

  async function refreshAudit() {
    const res = await apiJson<{ audit: AuditEntry[] }>('/api/admin/audit/list?limit=200');
    setAudit(res.audit);
  }

  useEffect(() => {
    if (!adminOk) return;
    setError(null);
    if (tab === 'rooms') void refreshRooms().catch((e) => setError(String((e as Error).message || e)));
    if (tab === 'users') void refreshUsers().catch((e) => setError(String((e as Error).message || e)));
    if (tab === 'audit') void refreshAudit().catch((e) => setError(String((e as Error).message || e)));
  }, [adminOk, tab]);

  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refreshAudit();
      if (tab === 'rooms') await refreshRooms();
      if (tab === 'users') await refreshUsers();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
        房间/用户管理（GitHub org 成员鉴权）
      </p>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
        <Button onClick={() => setTab('rooms')} disabled={tab === 'rooms'}>
          房间
        </Button>
        <Button onClick={() => setTab('users')} disabled={tab === 'users'}>
          用户
        </Button>
        <Button onClick={() => setTab('audit')} disabled={tab === 'audit'}>
          审计
        </Button>
      </div>

      {!uid ? (
        <div style={{ marginTop: 20, color: 'rgba(0,0,0,0.7)' }}>请先登录</div>
      ) : adminOk === null ? (
        <div style={{ marginTop: 20, color: 'rgba(0,0,0,0.7)' }}>检查权限中…</div>
      ) : !adminOk ? (
        <div style={{ marginTop: 20, color: '#b42318' }}>无管理员权限</div>
      ) : (
        <div style={{ marginTop: 18 }}>
          {adminInfo ? (
            <div style={{ color: 'rgba(0,0,0,0.6)' }}>
              当前账号：{adminInfo.uid}（org: {adminInfo.org}）
            </div>
          ) : null}

          {tab === 'rooms' ? (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
              <div style={{ padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>房间列表</div>
                  <Button onClick={() => act(refreshRooms)} disabled={busy}>
                    刷新
                  </Button>
                </div>

                <div style={{ marginTop: 10 }}>
                  {rooms.length === 0 ? (
                    <div style={{ color: 'rgba(0,0,0,0.6)' }}>暂无房间</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {rooms.map((r) => (
                        <button
                          key={r.roomCode}
                          onClick={() => setSelectedRoomCode(r.roomCode)}
                          style={{
                            textAlign: 'left',
                            padding: 10,
                            borderRadius: 12,
                            border: '1px solid rgba(0,0,0,0.08)',
                            background: r.roomCode === selectedRoomCode ? 'rgba(0,0,0,0.04)' : 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ fontWeight: 650 }}>{r.roomCode}</div>
                            <div style={{ color: 'rgba(0,0,0,0.6)' }}>{r.status}</div>
                          </div>
                          <div style={{ marginTop: 6, color: 'rgba(0,0,0,0.65)', fontSize: 13 }}>
                            host: {r.hostDisplayName} · 玩家 {r.playerCount} · 观战 {r.spectatorCount}
                          </div>
                          <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.5)', fontSize: 12 }}>
                            created: {fmtMs(r.createdAtMs)} · closed: {fmtMs(r.closedAtMs)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
                <div style={{ fontWeight: 600 }}>房间详情</div>
                {!selectedRoom ? (
                  <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.6)' }}>选择左侧房间查看</div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 13 }}>
                      status: {selectedRoom.status} · roomId: {selectedRoom.roomId}
                    </div>
                    <div style={{ marginTop: 6, color: 'rgba(0,0,0,0.65)', fontSize: 13 }}>
                      started: {fmtMs(selectedRoom.startedAtMs)} · ended: {fmtMs(selectedRoom.endedAtMs)} · closed: {fmtMs(selectedRoom.closedAtMs)}
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        onClick={() => act(() => apiPost('/api/admin/room/close', { roomCode: selectedRoom.roomCode }).then(() => void 0))}
                        disabled={busy}
                      >
                        关闭
                      </Button>
                      <Button
                        onClick={() => act(() => apiPost('/api/admin/room/archive', { roomCode: selectedRoom.roomCode }).then(() => void 0))}
                        disabled={busy || selectedRoom.status !== 'ended' || !!selectedRoom.closedAtMs}
                      >
                        归档
                      </Button>
                      <Button
                        onClick={() => act(() => apiPost('/api/admin/room/restore', { roomCode: selectedRoom.roomCode }).then(() => void 0))}
                        disabled={busy || !selectedRoom.closedAtMs}
                      >
                        恢复
                      </Button>
                      <Button
                        onClick={() =>
                          act(() =>
                            apiPost('/api/admin/room/force-end', { roomCode: selectedRoom.roomCode, reason: 'admin' }).then(() => void 0),
                          )
                        }
                        disabled={busy || selectedRoom.status !== 'playing'}
                      >
                        强制结束
                      </Button>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 600 }}>成员</div>
                      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                        {selectedRoom.members.map((m) => (
                          <div
                            key={m.playerId}
                            style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                              <div style={{ fontWeight: 650 }}>{m.displayName}</div>
                              <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>{m.playerId}</div>
                            </div>
                            <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>
                              {m.isSpectator ? 'spectator' : 'player'} · ready: {String(m.ready)}
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <Button
                                onClick={() =>
                                  act(() =>
                                    apiPost('/api/admin/room/set-host', { roomCode: selectedRoom.roomCode, hostPlayerId: m.playerId }).then(
                                      () => void 0,
                                    ),
                                  )
                                }
                                disabled={busy || selectedRoom.hostPlayerId === m.playerId}
                              >
                                设为房主
                              </Button>
                              <Button
                                onClick={() => act(() => apiPost('/api/admin/room/kick', { roomCode: selectedRoom.roomCode, playerId: m.playerId }).then(() => void 0))}
                                disabled={busy}
                              >
                                踢出
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'users' ? (
            <div style={{ marginTop: 14, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>用户列表</div>
                <Button onClick={() => act(refreshUsers)} disabled={busy}>
                  刷新
                </Button>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {users.map((u) => (
                  <div key={u.id} style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {u.avatarUrl ? (
                          <div style={{ position: 'relative', width: 28, height: 28, borderRadius: 999, overflow: 'hidden', flex: '0 0 auto' }}>
                            <Image src={u.avatarUrl} alt="" fill sizes="28px" style={{ objectFit: 'cover' }} unoptimized />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(0,0,0,0.06)',
                              color: 'rgba(0,0,0,0.7)',
                              fontWeight: 800,
                              fontSize: 13,
                              flex: '0 0 auto',
                            }}
                          >
                            {initialFor(u.displayName)}
                          </div>
                        )}
                        <div style={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName}</div>
                      </div>
                      <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>{u.id}</div>
                    </div>
                    <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.65)', fontSize: 13 }}>
                      rooms: {u.roomCount} · friends: {u.friendCount}
                    </div>
                    <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.5)', fontSize: 12 }}>
                      created: {u.createdAt ?? '-'} · updated: {u.updatedAt ?? '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'audit' ? (
            <div style={{ marginTop: 14, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>审计日志（最近 200 条）</div>
                <Button onClick={() => act(refreshAudit)} disabled={busy}>
                  刷新
                </Button>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {audit.map((a) => (
                  <div key={a.id} style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontWeight: 650 }}>{a.action}</div>
                      <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>{fmtMs(a.atMs)}</div>
                    </div>
                    <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.65)', fontSize: 13 }}>
                      actor: {a.actorUid} · target: {a.targetType ?? '-'} {a.targetId ?? ''}
                    </div>
                    <pre style={{ marginTop: 6, marginBottom: 0, fontSize: 12, overflow: 'auto', maxHeight: 140 }}>
                      {JSON.stringify(a.detail ?? null, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
        </div>
      )}
    </main>
  );
}
