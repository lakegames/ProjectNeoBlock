"use client";

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Card, Input } from '@neoblock/ui';

import './home.css';

type PublishedConfigItem = { docId: string; name: string; versionId: string; updatedAtMs: number };

type InboxInvite = {
  id: string;
  toUid: string;
  fromUid: string;
  roomCode: string;
  createdAtMs: number;
};

function useGridLayoutState(ref: { current: HTMLElement | null }) {
  const [state, setState] = useState({ accordionEnabled: false, narrow: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const compute = () => {
      const styles = getComputedStyle(el);
      const cols = (styles.gridTemplateColumns || '')
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      const narrow = cols.length < 2;
      setState({ accordionEnabled: narrow, narrow });
    };

    const computeRaf = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();

    const ro = new ResizeObserver(computeRaf);
    ro.observe(el);
    window.addEventListener('resize', computeRaf);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', computeRaf);
    };
  }, [ref]);

  return state;
}

export default function Page() {
  const router = useRouter();
  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [publishedTemplates, setPublishedTemplates] = useState<PublishedConfigItem[]>([]);
  const [defaultTemplateVersionId, setDefaultTemplateVersionId] = useState<string>('');

  const [createNickname, setCreateNickname] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinSpectate, setJoinSpectate] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  const joinGridRef = useRef<HTMLDivElement | null>(null);
  const createGridRef = useRef<HTMLDivElement | null>(null);
  const joinGridState = useGridLayoutState(joinGridRef);
  const createGridState = useGridLayoutState(createGridRef);
  const joinAccordionEnabled = joinGridState.accordionEnabled;
  const createAccordionEnabled = createGridState.accordionEnabled;
  const [joinAccordionOpenIndex, setJoinAccordionOpenIndex] = useState(0);
  const [createAccordionOpenIndex, setCreateAccordionOpenIndex] = useState(0);

  useEffect(() => {
    if (!joinAccordionEnabled) return;
    setJoinAccordionOpenIndex((v) => (v < 0 ? 0 : v));
  }, [joinAccordionEnabled]);

  useEffect(() => {
    if (!createAccordionEnabled) return;
    setCreateAccordionOpenIndex((v) => (v < 0 ? 0 : v));
  }, [createAccordionEnabled]);

  const canCreate = useMemo(() => (uid ? true : !!createNickname.trim()), [createNickname, uid]);
  const canJoin = useMemo(() => {
    if (!joinRoomCode.trim()) return false;
    if (uid) return true;
    return !!joinNickname.trim();
  }, [joinNickname, joinRoomCode, uid]);

  useEffect(() => {
    fetch('/api/config/published', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setPublishedTemplates((json.templates ?? []) as PublishedConfigItem[]);
        setDefaultTemplateVersionId(typeof json.defaultTemplateVersionId === 'string' ? json.defaultTemplateVersionId : '');
      })
      .catch(() => {});
  }, []);

  const [inboxInvites, setInboxInvites] = useState<InboxInvite[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  async function refreshInbox() {
    setInboxLoading(true);
    try {
      if (!uid) {
        setInboxInvites([]);
        return;
      }
      const r = await fetch('/api/game-invite/inbox', { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'INBOX_FAILED');
      setInboxInvites((json.invites ?? []) as InboxInvite[]);
    } catch {
      setInboxInvites([]);
    } finally {
      setInboxLoading(false);
    }
  }
  useEffect(() => {
    refreshInbox();
  }, [uid]);

  const senderIdsKey = useMemo(() => {
    const ids = [...new Set(inboxInvites.map((x) => x.fromUid).filter(Boolean))];
    ids.sort();
    return ids.join(',');
  }, [inboxInvites]);
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

  const [customOpen, setCustomOpen] = useState(false);
  const [customTemplateVersionId, setCustomTemplateVersionId] = useState('');
  useEffect(() => {
    if (!customOpen) return;
    if (!customTemplateVersionId) setCustomTemplateVersionId(defaultTemplateVersionId);
  }, [customOpen, customTemplateVersionId, defaultTemplateVersionId]);

  async function createRoomWithTemplate(templateVersionId: string) {
    if (!canCreate || createLoading) return;
    if (!templateVersionId) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const r = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: uid ? 'account' : 'guest',
          nickname: createNickname,
          config: {
            maxPlayers: 4,
            turnTimeSec: 60,
            enableAuto: false,
            enableAI: false,
            templateVersionId,
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

  async function createRoomFromCustomModal() {
    if (!customTemplateVersionId) return;
    setCustomOpen(false);
    await createRoomWithTemplate(customTemplateVersionId);
  }

  async function joinRoom() {
    if (!canJoin || joinLoading) return;
    setJoinLoading(true);
    setJoinError(null);
    try {
      const roomCode = joinRoomCode.trim().toUpperCase();
      const r = await fetch(joinSpectate ? '/api/room/spectate' : '/api/room/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          nickname: joinNickname,
          ...(joinSpectate ? {} : { mode: uid ? 'account' : 'guest' }),
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'JOIN_FAILED');
      router.push(`/room/${encodeURIComponent(roomCode)}${joinSpectate ? '?spectate=1' : ''}`);
    } catch (e) {
      setJoinError(String((e as Error).message || e));
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <main className="nb-home">
      <div className="nb-home__body">
        <section className="nb-home__col nb-home__col--join">
          <div className="nb-home__panel">
            <div>
              <h2 className="nb-home__title">加入房间</h2>
              <div className="nb-home__subtitle">快捷加入房间</div>
            </div>

            <div
              ref={joinGridRef}
              className={[
                'nb-home__grid2',
                joinAccordionEnabled ? 'nb-home__grid2--accordion' : null,
                !joinGridState.narrow ? 'nb-home__grid2--wide' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Card
                className={['nb-home__card', joinAccordionEnabled && joinAccordionOpenIndex === 0 ? 'is-open' : null].filter(Boolean).join(' ')}
                style={{ background: '#fbf3f1' }}
              >
                <button
                  type="button"
                  className="nb-home__accordion-trigger"
                  aria-expanded={joinAccordionEnabled ? joinAccordionOpenIndex === 0 : true}
                  onClick={() => {
                    if (!joinAccordionEnabled) return;
                    setJoinAccordionOpenIndex(0);
                  }}
                >
                  通过房间码加入
                </button>
                <div className="nb-home__accordion-content">
                  <div className="nb-home__field">
                    <Input
                      value={joinRoomCode}
                      onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                      placeholder="房间码"
                      style={{ width: '100%' }}
                    />
                    {!uid ? (
                      <Input
                        value={joinNickname}
                        onChange={(e) => setJoinNickname(e.target.value)}
                        placeholder="昵称"
                        style={{ width: '100%' }}
                      />
                    ) : null}
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'rgba(0,0,0,0.65)', fontSize: 14 }}>
                      <input type="checkbox" checked={joinSpectate} onChange={(e) => setJoinSpectate(e.target.checked)} />
                      以观战身份加入房间
                    </label>
                  </div>
                  <div className="nb-home__actions">
                    <Button mode="Primary" onClick={joinRoom} disabled={!canJoin || joinLoading}>
                      {joinLoading ? '加入中…' : '加入房间'}
                    </Button>
                  </div>
                  {joinError ? <div style={{ marginTop: 10, color: '#b42318' }}>{joinError}</div> : null}
                </div>
              </Card>

              <Card
                className={['nb-home__card', joinAccordionEnabled && joinAccordionOpenIndex === 1 ? 'is-open' : null].filter(Boolean).join(' ')}
                style={{ background: '#fbf3f1' }}
              >
                <button
                  type="button"
                  className="nb-home__accordion-trigger"
                  aria-expanded={joinAccordionEnabled ? joinAccordionOpenIndex === 1 : true}
                  onClick={() => {
                    if (!joinAccordionEnabled) return;
                    setJoinAccordionOpenIndex(1);
                  }}
                >
                  和好友同玩
                </button>
                <div className="nb-home__accordion-content">
                  {inboxLoading ? (
                    <div style={{ color: 'rgba(0,0,0,0.65)' }}>加载中…</div>
                  ) : inboxInvites.length ? (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {inboxInvites.slice(0, 3).map((x) => {
                        const sender = senders[x.fromUid];
                        const shownName = sender?.displayName || x.fromUid;
                        return (
                          <div
                            key={x.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              padding: '10px 12px',
                              borderRadius: 12,
                              border: '1px solid rgba(0,0,0,0.08)',
                              background: '#fff',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'rgba(0,0,0,0.85)' }}>{shownName}</div>
                              <div style={{ marginTop: 2, color: 'rgba(0,0,0,0.65)', fontSize: 12 }}>
                                邀请你加入房间 {x.roomCode}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <Button
                                mode="Primary"
                                size="sm"
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
                                加入
                              </Button>
                              <Button
                                mode="Second"
                                size="sm"
                                onClick={async () => {
                                  await fetch('/api/game-invite/dismiss', {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ id: x.id }),
                                  });
                                  setInboxInvites((list) => list.filter((m) => m.id !== x.id));
                                }}
                              >
                                忽略
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {inboxInvites.length > 3 ? (
                        <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 12 }}>还有 {inboxInvites.length - 3} 条未处理邀请…</div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: 'rgba(0,0,0,0.65)' }}>暂无邀请</div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <Button mode="NoBackground" size="sm" onClick={refreshInbox} disabled={inboxLoading}>
                          {inboxLoading ? '刷新中…' : '刷新邀请'}
                        </Button>
                        <Button mode="NoBackground" size="sm" onClick={() => router.push('/invite')}>
                          去好友页
                        </Button>
                      </div>
                    </div>
                  )}
                  {inboxInvites.length ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                      <Button mode="NoBackground" size="sm" onClick={refreshInbox} disabled={inboxLoading}>
                        {inboxLoading ? '刷新中…' : '刷新邀请'}
                      </Button>
                      <Button mode="NoBackground" size="sm" onClick={() => router.push('/invite')}>
                        去好友页
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="nb-home__col nb-home__col--create">
          <div className="nb-home__panel">
            <div>
              <h2 className="nb-home__title">创建房间</h2>
              <div className="nb-home__subtitle">和朋友们一起开玩</div>
            </div>

            <div
              ref={createGridRef}
              className={[
                'nb-home__grid2',
                createAccordionEnabled ? 'nb-home__grid2--accordion' : null,
                !createGridState.narrow ? 'nb-home__grid2--wide' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Card
                className={['nb-home__card', createAccordionEnabled && createAccordionOpenIndex === 0 ? 'is-open' : null].filter(Boolean).join(' ')}
                style={{ background: '#ffffff' }}
              >
                <button
                  type="button"
                  className="nb-home__accordion-trigger"
                  aria-expanded={createAccordionEnabled ? createAccordionOpenIndex === 0 : true}
                  onClick={() => {
                    if (!createAccordionEnabled) return;
                    setCreateAccordionOpenIndex(0);
                  }}
                >
                  快速创建
                </button>
                <div className="nb-home__accordion-content">
                  <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 14, lineHeight: '20px' }}>
                    使用标准大富翁规则和 40 格地块游戏
                  </div>
                  {!uid ? (
                    <div style={{ marginTop: 10 }}>
                      <Input
                        value={createNickname}
                        onChange={(e) => setCreateNickname(e.target.value)}
                        placeholder="昵称"
                        style={{ width: '100%' }}
                      />
                    </div>
                  ) : null}
                  <div className="nb-home__actions">
                    <Button
                      mode="Primary"
                      onClick={() => createRoomWithTemplate(defaultTemplateVersionId)}
                      disabled={!canCreate || createLoading || !defaultTemplateVersionId}
                    >
                      {createLoading ? '创建中…' : '创建房间'}
                    </Button>
                  </div>
                  {createError ? <div style={{ marginTop: 10, color: '#b42318' }}>{createError}</div> : null}
                </div>
              </Card>

              <Card
                className={['nb-home__card', createAccordionEnabled && createAccordionOpenIndex === 1 ? 'is-open' : null].filter(Boolean).join(' ')}
                style={{ background: '#ffffff' }}
              >
                <button
                  type="button"
                  className="nb-home__accordion-trigger"
                  aria-expanded={createAccordionEnabled ? createAccordionOpenIndex === 1 : true}
                  onClick={() => {
                    if (!createAccordionEnabled) return;
                    setCreateAccordionOpenIndex(1);
                  }}
                >
                  自定义
                </button>
                <div className="nb-home__accordion-content">
                  <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 14, lineHeight: '20px' }}>
                    管理模板，以及规则/棋盘/卡牌 配置
                  </div>
                  <div className="nb-home__actions">
                    <Button mode="Primary" onClick={() => setCustomOpen(true)}>
                      选择模板
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>
      </div>

      {customOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 50,
          }}
          onClick={() => setCustomOpen(false)}
        >
          <div style={{ width: 'min(720px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <Card style={{ background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>选择模板</div>
                <Button mode="Second" onClick={() => setCustomOpen(false)}>
                  关闭
                </Button>
              </div>
              <div style={{ marginTop: 10, color: 'rgba(0,0,0,0.65)', fontSize: 14, lineHeight: '20px' }}>
                可直接用模板创建房间，或去“游戏自定义”制作/发布模板
              </div>
              <div style={{ marginTop: 12 }}>
                <select
                  value={customTemplateVersionId}
                  onChange={(e) => setCustomTemplateVersionId(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: '#fff',
                    width: '100%',
                  }}
                >
                  <option value="">选择模板</option>
                  {publishedTemplates.map((t) => (
                    <option key={t.versionId} value={t.versionId}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {!uid ? (
                <div style={{ marginTop: 10 }}>
                  <Input value={createNickname} onChange={(e) => setCreateNickname(e.target.value)} placeholder="昵称" style={{ width: '100%' }} />
                </div>
              ) : null}
              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button mode="Primary" onClick={createRoomFromCustomModal} disabled={!customTemplateVersionId || !canCreate || createLoading}>
                  {createLoading ? '创建中…' : '用该模板创建'}
                </Button>
                <Button mode="Second" onClick={() => router.push('/config?tab=template')}>
                  去游戏自定义
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </main>
  );
}
