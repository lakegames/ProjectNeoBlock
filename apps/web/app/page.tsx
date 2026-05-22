"use client";

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button, Input, RoomCard } from '@neoblock/ui';

type RoomListItem = {
  roomCode: string;
  status: 'lobby' | 'playing' | 'ended';
  createdAtMs: number;
  startedAtMs: number | null;
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  hostDisplayName: string;
  playerCount: number;
  spectatorCount: number;
};

type PublishedConfigItem = { docId: string; name: string; versionId: string; updatedAtMs: number };

function validateConfig(input: { maxPlayers: number; turnTimeSec: number }) {
  if (!Number.isInteger(input.maxPlayers) || input.maxPlayers < 2 || input.maxPlayers > 16) {
    return '玩家上限范围：2-16（整数）';
  }
  if (!Number.isInteger(input.turnTimeSec) || input.turnTimeSec < 10 || input.turnTimeSec > 600) {
    return '回合时间范围：10-600（整数秒）';
  }
  return null;
}

export default function Page() {
  const router = useRouter();
  const { data, status } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [createMode, setCreateMode] = useState<'guest' | 'account'>('guest');
  const [createNickname, setCreateNickname] = useState('');
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);
  const [createTurnTimeSec, setCreateTurnTimeSec] = useState(60);
  const [createEnableAuto, setCreateEnableAuto] = useState(false);
  const [createEnableAI, setCreateEnableAI] = useState(false);
  const [publishedRules, setPublishedRules] = useState<PublishedConfigItem[]>([]);
  const [publishedBoards, setPublishedBoards] = useState<PublishedConfigItem[]>([]);
  const [publishedCards, setPublishedCards] = useState<PublishedConfigItem[]>([]);
  const [createRulesVersionId, setCreateRulesVersionId] = useState<string>('');
  const [createBoardVersionId, setCreateBoardVersionId] = useState<string>('');
  const [createCardsVersionId, setCreateCardsVersionId] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [joinMode, setJoinMode] = useState<'guest' | 'account'>('guest');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  const canCreate = useMemo(() => {
    if (createMode === 'account') return !!uid;
    return !!createNickname.trim();
  }, [createMode, createNickname, uid]);

  const canJoin = useMemo(() => {
    if (!joinRoomCode.trim()) return false;
    if (joinMode === 'account') return !!uid;
    return !!joinNickname.trim();
  }, [joinMode, joinNickname, joinRoomCode, uid]);

  async function refreshRooms() {
    setRoomsLoading(true);
    try {
      const r = await fetch('/api/room/list', { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'LIST_FAILED');
      setRooms((json.rooms ?? []) as RoomListItem[]);
    } catch {
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }

  useEffect(() => {
    refreshRooms();
  }, []);

  useEffect(() => {
    setIsAdmin(false);
    if (!uid) return;
    fetch('/api/admin/ping', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok }) => setIsAdmin(ok))
      .catch(() => setIsAdmin(false));
  }, [uid]);

  useEffect(() => {
    fetch('/api/config/published', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        const rules = (json.rules ?? []) as PublishedConfigItem[];
        const boards = (json.boards ?? []) as PublishedConfigItem[];
        const cards = (json.cards ?? []) as PublishedConfigItem[];
        setPublishedRules(rules);
        setPublishedBoards(boards);
        setPublishedCards(cards);
        if (!createRulesVersionId && rules[0]?.versionId) setCreateRulesVersionId(rules[0].versionId);
        if (!createBoardVersionId && boards[0]?.versionId) setCreateBoardVersionId(boards[0].versionId);
        if (!createCardsVersionId && cards[0]?.versionId) setCreateCardsVersionId(cards[0].versionId);
      })
      .catch(() => {});
  }, [createBoardVersionId, createCardsVersionId, createRulesVersionId]);

  async function createRoom() {
    if (!canCreate || createLoading) return;
    const err = validateConfig({ maxPlayers: createMaxPlayers, turnTimeSec: createTurnTimeSec });
    if (err) {
      setCreateError(err);
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const r = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: createMode,
          nickname: createNickname,
          config: {
            maxPlayers: createMaxPlayers,
            turnTimeSec: createTurnTimeSec,
            enableAuto: createEnableAuto,
            enableAI: createEnableAI,
            ...(createRulesVersionId ? { rulesetVersionId: createRulesVersionId } : {}),
            ...(createBoardVersionId ? { boardVersionId: createBoardVersionId } : {}),
            ...(createCardsVersionId ? { cardsVersionId: createCardsVersionId } : {}),
          },
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'CREATE_FAILED');
      router.push(`/room/${encodeURIComponent(json.roomCode)}`);
    } catch (e) {
      setCreateError(String((e as Error).message || e));
    } finally {
      setCreateLoading(false);
    }
  }

  async function joinRoom() {
    if (!canJoin || joinLoading) return;
    setJoinLoading(true);
    setJoinError(null);
    try {
      const r = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomCode: joinRoomCode,
          nickname: joinNickname,
          mode: joinMode,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'JOIN_FAILED');
      router.push(`/room/${encodeURIComponent(json.roomCode)}`);
    } catch (e) {
      setJoinError(String((e as Error).message || e));
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <main>
      <h1 style={{ margin: 0 }}>NeoBlock</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
        Task3：大厅、房间参数、准备/开局、观战（最小 UI）
      </p>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/login">
          <Button>登录</Button>
        </Link>
        <Link href="/profile">
          <Button>账号资料</Button>
        </Link>
        <Link href="/invite">
          <Button>邀请好友</Button>
        </Link>
        <Link href="/config">
          <Button>配置管理</Button>
        </Link>
        <Link href="/join">
          <Button>加入房间</Button>
        </Link>
        {isAdmin ? (
          <Link href="/admin">
            <Button>Admin</Button>
          </Link>
        ) : null}
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>会话</div>
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.7)' }}>
          {status === 'loading' ? '加载中…' : data?.user ? `已登录：${data.user.name ?? data.user.email ?? '用户'}` : '未登录'}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => signIn(undefined, { callbackUrl: '/' })} disabled={!!data?.user}>
            去登录
          </Button>
          <Button onClick={() => signOut({ callbackUrl: '/' })} disabled={!data?.user}>
            退出登录
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>创建房间</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={createMode === 'guest'}
              onChange={() => setCreateMode('guest')}
              name="createMode"
            />
            匿名创建
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={createMode === 'account'}
              onChange={() => setCreateMode('account')}
              name="createMode"
              disabled={!uid}
            />
            账号创建（需登录）
          </label>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            value={createNickname}
            onChange={(e) => setCreateNickname(e.target.value)}
            placeholder={createMode === 'guest' ? '匿名昵称（必填）' : '昵称（可选）'}
            disabled={createMode === 'account' && !uid}
            style={{
              minWidth: 240,
            }}
          />
          <select
            value={createRulesVersionId}
            onChange={(e) => setCreateRulesVersionId(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              minWidth: 220,
            }}
          >
            {publishedRules.length ? null : <option value="">暂无已发布规则</option>}
            {publishedRules.map((x) => (
              <option key={x.versionId} value={x.versionId}>
                规则：{x.name}（{x.versionId}）
              </option>
            ))}
          </select>
          <select
            value={createBoardVersionId}
            onChange={(e) => setCreateBoardVersionId(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              minWidth: 220,
            }}
          >
            {publishedBoards.length ? null : <option value="">暂无已发布棋盘</option>}
            {publishedBoards.map((x) => (
              <option key={x.versionId} value={x.versionId}>
                棋盘：{x.name}（{x.versionId}）
              </option>
            ))}
          </select>
          <select
            value={createCardsVersionId}
            onChange={(e) => setCreateCardsVersionId(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              minWidth: 220,
            }}
          >
            {publishedCards.length ? null : <option value="">暂无已发布卡牌</option>}
            {publishedCards.map((x) => (
              <option key={x.versionId} value={x.versionId}>
                卡牌：{x.name}（{x.versionId}）
              </option>
            ))}
          </select>
          <Input
            value={String(createMaxPlayers)}
            onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
            type="number"
            min={2}
            max={16}
            step={1}
            style={{
              width: 160,
            }}
          />
          <Input
            value={String(createTurnTimeSec)}
            onChange={(e) => setCreateTurnTimeSec(Number(e.target.value))}
            type="number"
            min={10}
            max={600}
            step={1}
            style={{
              width: 160,
            }}
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={createEnableAuto} onChange={(e) => setCreateEnableAuto(e.target.checked)} />
            托管
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={createEnableAI} onChange={(e) => setCreateEnableAI(e.target.checked)} />
            AI
          </label>
          <Button onClick={createRoom} disabled={!canCreate || createLoading}>
            {createLoading ? '创建中…' : '创建并进入'}
          </Button>
        </div>
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.6)' }}>
          玩家上限（2-16）｜回合时间（秒，10-600）
        </div>
        {createError ? <div style={{ marginTop: 10, color: '#b42318' }}>{createError}</div> : null}
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>加入房间（玩家）</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="radio" checked={joinMode === 'guest'} onChange={() => setJoinMode('guest')} name="joinMode" />
            匿名加入
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={joinMode === 'account'}
              onChange={() => setJoinMode('account')}
              name="joinMode"
              disabled={!uid}
            />
            账号加入（需登录）
          </label>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            value={joinRoomCode}
            onChange={(e) => setJoinRoomCode(e.target.value)}
            placeholder="房间码（例如 ABC123）"
            style={{
              minWidth: 240,
            }}
          />
          <Input
            value={joinNickname}
            onChange={(e) => setJoinNickname(e.target.value)}
            placeholder={joinMode === 'guest' ? '匿名昵称（必填）' : '昵称（可选）'}
            disabled={joinMode === 'account' && !uid}
            style={{
              minWidth: 240,
            }}
          />
          <Button onClick={joinRoom} disabled={!canJoin || joinLoading}>
            {joinLoading ? '加入中…' : '加入并进入'}
          </Button>
        </div>
        {joinError ? <div style={{ marginTop: 10, color: '#b42318' }}>{joinError}</div> : null}
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>房间列表（最近30条）</div>
          <Button onClick={refreshRooms} disabled={roomsLoading}>
            {roomsLoading ? '刷新中…' : '刷新'}
          </Button>
        </div>
        <div style={{ marginTop: 10 }}>
          {rooms.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
              {rooms.map((r) => (
                <RoomCard
                  key={r.roomCode}
                  {...r}
                  actions={
                    <>
                      <Link href={`/room/${encodeURIComponent(r.roomCode)}`}>
                        <Button size="sm" mode="Second">
                          查看
                        </Button>
                      </Link>
                      <Link href={`/room/${encodeURIComponent(r.roomCode)}?spectate=1`}>
                        <Button size="sm" mode="NoBackground">
                          观战
                        </Button>
                      </Link>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <div style={{ color: 'rgba(0,0,0,0.65)' }}>暂无房间</div>
          )}
        </div>
      </div>
    </main>
  );
}
