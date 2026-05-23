"use client";

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Button } from '@neoblock/ui';

type ProfileSummary = {
  id: string;
  displayName: string;
  avatarKind?: 'custom' | 'github' | 'none';
  avatarUrl?: string | null;
};

type InboxInvite = {
  id: string;
  toUid: string;
  fromUid: string;
  roomCode: string;
  createdAtMs: number;
  readAtMs?: number;
};

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return '?';
  const last = s.at(-1);
  return last ? last.toUpperCase() : '?';
}

export default function FriendsPage() {
  const { data } = useSession();
  const router = useRouter();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [last, setLast] = useState<{ code: string; link: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [maxUses, setMaxUses] = useState(5);
  const [expiresInSec, setExpiresInSec] = useState(24 * 3600);

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  useEffect(() => {
    setProfile(null);
    setFriends([]);
    if (!uid) return;
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setProfile((json.profile ?? null) as ProfileSummary | null);
        setFriends((json.friends ?? []) as string[]);
      })
      .catch(() => {});
  }, [uid]);

  void profile;

  const [inbox, setInbox] = useState<InboxInvite[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  useEffect(() => {
    setInbox([]);
    if (!uid) return;
    setInboxLoading(true);
    fetch('/api/game-invite/inbox', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setInbox((json.invites ?? []) as InboxInvite[]);
      })
      .catch(() => {})
      .finally(() => setInboxLoading(false));
  }, [uid]);

  const senderIdsKey = useMemo(() => {
    const ids = [...new Set(inbox.map((x) => x.fromUid).filter(Boolean))];
    ids.sort();
    return ids.join(',');
  }, [inbox]);
  const [senders, setSenders] = useState<Record<string, { id: string; displayName: string; avatarUrl: string | null }>>({});
  useEffect(() => {
    const ids = senderIdsKey ? senderIdsKey.split(',').filter(Boolean) : [];
    if (!ids.length) {
      setSenders({});
      return;
    }
    fetch(`/api/profile/public?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        const list = (json.profiles ?? []) as { id: string; displayName: string; avatarUrl: string | null }[];
        const map: Record<string, { id: string; displayName: string; avatarUrl: string | null }> = {};
        for (const p of list) map[p.id] = p;
        setSenders(map);
      })
      .catch(() => {});
  }, [senderIdsKey]);

  async function createInvite() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maxUses, expiresInSec }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'CREATE_FAILED');
      setLast({ code: json.code, link: json.link });
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>好友</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
        好友页：邀请好友（多次+有效期）、好友列表、房间邀请消息
      </p>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>生成邀请码</div>
        {!uid ? (
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.7)' }}>请先登录</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'rgba(0,0,0,0.65)' }}>最多使用</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={String(maxUses)}
                  onChange={(e) => setMaxUses(Math.max(1, Math.min(100, Math.trunc(Number(e.target.value) || 1))))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.12)',
                    width: 120,
                  }}
                />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'rgba(0,0,0,0.65)' }}>有效期</span>
                <select
                  value={String(expiresInSec)}
                  onChange={(e) => setExpiresInSec(Math.trunc(Number(e.target.value) || 3600))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: '#fff',
                  }}
                >
                  <option value={3600}>1 小时</option>
                  <option value={6 * 3600}>6 小时</option>
                  <option value={24 * 3600}>24 小时</option>
                  <option value={7 * 24 * 3600}>7 天</option>
                </select>
              </label>
            </div>
            <Button onClick={createInvite} disabled={loading}>
              生成
            </Button>
            {last ? (
              <div style={{ marginTop: 12, color: 'rgba(0,0,0,0.7)' }}>
                <div>邀请码：{last.code}</div>
                <div style={{ marginTop: 6 }}>
                  邀请链接：{' '}
                  <a href={last.link} style={{ color: '#0b63f6' }}>
                    {last.link}
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>接受邀请码</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="输入邀请码"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)',
              minWidth: 220,
            }}
          />
          <Button
            onClick={() => {
              const c = code.trim();
              if (!c) return;
              router.push(`/invite/${encodeURIComponent(c)}`);
            }}
            disabled={!code.trim()}
          >
            去接受
          </Button>
        </div>
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
          接受邀请码需要登录（会将双方加入彼此好友列表）
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>好友列表</div>
        {!uid ? (
          <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)' }}>请先登录</div>
        ) : (
          <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)' }}>{friends.length ? friends.join(', ') : '暂无好友'}</div>
        )}
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>房间邀请</div>
        {!uid ? (
          <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)' }}>请先登录</div>
        ) : inboxLoading ? (
          <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)' }}>加载中…</div>
        ) : inbox.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, marginTop: 10 }}>
            {inbox.map((x) => {
              const sender = senders[x.fromUid];
              const shownName = sender?.displayName || x.fromUid;
              const shownAvatar = sender?.avatarUrl ?? null;
              const isRead = !!x.readAtMs;
              return (
                <li key={x.id} style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {shownAvatar ? (
                      <div style={{ position: 'relative', width: 22, height: 22, borderRadius: 999, overflow: 'hidden', flex: '0 0 auto' }}>
                        <Image src={shownAvatar} alt="" fill sizes="22px" style={{ objectFit: 'cover' }} unoptimized />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,0.06)',
                          color: 'rgba(0,0,0,0.7)',
                          fontWeight: 800,
                          fontSize: 12,
                          flex: '0 0 auto',
                        }}
                      >
                        {initialFor(shownName)}
                      </div>
                    )}
                    <div style={{ color: 'rgba(0,0,0,0.7)' }}>
                      {shownName} 邀请你加入房间 {x.roomCode}{isRead ? '' : '（未读）'}
                    </div>
                    <Button
                      mode="Primary"
                      onClick={async () => {
                        try {
                          await fetch('/api/game-invite/read', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ id: x.id }),
                          });
                        } finally {
                          router.push(`/room/${encodeURIComponent(x.roomCode)}`);
                        }
                      }}
                    >
                      去加入
                    </Button>
                    <Button
                      mode="Second"
                      onClick={async () => {
                        await fetch('/api/game-invite/dismiss', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ id: x.id }),
                        });
                        setInbox((list) => list.filter((m) => m.id !== x.id));
                      }}
                    >
                      忽略
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)' }}>暂无房间邀请</div>
        )}
      </div>

      {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
    </main>
  );
}
