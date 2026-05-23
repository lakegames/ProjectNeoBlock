"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { Button, Dialog } from '@neoblock/ui';
import type { ReactNode } from 'react';

import LoginView from './login/login-view';
import { readActiveGame } from '../lib/active-game';

type ProfileSummary = {
  id: string;
  displayName: string;
  avatarKind?: 'custom' | 'github' | 'none';
  avatarUrl?: string | null;
};

type ProfileResponse = {
  profile: ProfileSummary;
  friends: string[];
};

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return '?';
  const last = s.at(-1);
  return last ? last.toUpperCase() : '?';
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;
  const isRoomRoute = pathname.startsWith('/room/');

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [activeGameRoomCode, setActiveGameRoomCode] = useState<string>('');
  useEffect(() => {
    const sync = () => {
      const g = readActiveGame();
      setActiveGameRoomCode(g?.roomCode ?? '');
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    setProfile(null);
    setFriends([]);
    setDisplayNameDraft('');
    setProfileError(null);
    setAvatarPreview(null);
    setAvatarError(null);
    if (!uid) return;
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        const res = (json ?? null) as ProfileResponse | null;
        setProfile((res?.profile ?? null) as ProfileSummary | null);
        setFriends((res?.friends ?? []) as string[]);
        setDisplayNameDraft(String(res?.profile?.displayName ?? ''));
      })
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    setIsAdmin(false);
    if (!uid) return;
    fetch('/api/admin/ping', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok }) => setIsAdmin(ok))
      .catch(() => setIsAdmin(false));
  }, [uid]);

  useEffect(() => {
    setProfileOpen(false);
    setLoginOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (uid) setLoginOpen(false);
  }, [uid]);

  const displayName = profile?.displayName ?? data?.user?.name ?? data?.user?.email ?? '';
  const initial = useMemo(() => initialFor(displayName), [displayName]);
  const avatarUrl = profile?.avatarUrl ?? null;
  const shownAvatarUrl = avatarPreview ?? avatarUrl ?? null;
  const shownInitial = initialFor(displayNameDraft || displayName || uid || '');
  const canClearAvatar = (profile?.avatarKind ?? 'none') === 'custom';

  const canSaveDisplayName = useMemo(() => {
    if (!uid) return false;
    const name = displayNameDraft.trim();
    if (!name || name.length > 40) return false;
    if (!profile) return true;
    return name !== profile.displayName;
  }, [displayNameDraft, profile, uid]);

  async function saveDisplayName() {
    if (!canSaveDisplayName || savingProfile) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: displayNameDraft }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'SAVE_FAILED');
      setProfile((json.profile ?? null) as ProfileSummary | null);
      setDisplayNameDraft(String(json?.profile?.displayName ?? displayNameDraft));
    } catch (e) {
      setProfileError(String((e as Error).message || e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar() {
    if (!uid || !avatarPreview || avatarSaving) return;
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      const r = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataUrl: avatarPreview }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'AVATAR_UPLOAD_FAILED');
      setProfile((json.profile ?? null) as ProfileSummary | null);
      setAvatarPreview(null);
    } catch (e) {
      setAvatarError(String((e as Error).message || e));
    } finally {
      setAvatarSaving(false);
    }
  }

  async function clearAvatar() {
    if (!uid || avatarSaving) return;
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      const r = await fetch('/api/profile/avatar', { method: 'DELETE' });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'AVATAR_CLEAR_FAILED');
      setProfile((json.profile ?? null) as ProfileSummary | null);
      setAvatarPreview(null);
    } catch (e) {
      setAvatarError(String((e as Error).message || e));
    } finally {
      setAvatarSaving(false);
    }
  }

  function openProfile() {
    setProfileOpen(true);
  }

  function closeProfile() {
    setProfileOpen(false);
    if (searchParams.get('profile') !== '1') return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('profile');
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }

  useEffect(() => {
    if (searchParams.get('profile') === '1') {
      openProfile();
    }
  }, [searchParams]);

  function openLogin() {
    setProfileOpen(false);
    setLoginOpen(true);
  }

  const tabItems = useMemo(() => {
    return [
      { key: 'home', label: '首页', href: '/' },
      { key: 'friends', label: '好友', href: '/invite' },
      { key: 'custom', label: '游戏自定义', href: '/config' },
      { key: 'history', label: '历史对局', href: '/history' },
    ];
  }, []);

  const activeKey = useMemo(() => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/invite')) return 'friends';
    if (pathname.startsWith('/config')) return 'custom';
    if (pathname.startsWith('/history')) return 'history';
    return '';
  }, [pathname]);

  return (
    <div className="nb-app-shell" data-nb-app-shell>
      <header className="nb-app-shell__topbar" data-nb-topbar>
        <div className="nb-app-shell__topbar-left" data-nb-topbar-left>
          <Button
            type="button"
            size="md"
            mode="NoBackground-Custom"
            className="nb-app-shell__menu-button"
            data-nb-menu-button
            aria-label="Menu"
            iconLeft={{ name: 'general_menu', mode: 'default', thickness: 'Light' }}
          >
          </Button>
          <div className="nb-app-shell__brand" data-nb-brand>
            NeoBlock
          </div>
        </div>

        <div className="nb-app-shell__topbar-center" data-nb-topbar-center>
          <div className="nb-app-shell__status" data-nb-status>
            {pathname === '/' && activeGameRoomCode ? (
              <Button
                type="button"
                size="md"
                mode="Second"
                className="nb-app-shell__active-game"
                onClick={() => router.push(`/room/${encodeURIComponent(activeGameRoomCode)}`)}
              >
                你还有游戏进行中
              </Button>
            ) : null}
          </div>
        </div>

        <div className="nb-app-shell__topbar-right" data-nb-topbar-right>
          {isAdmin ? (
            <Button
              type="button"
              size="md"
              mode="NoBackground-Custom"
              className="nb-app-shell__admin-link"
              data-nb-admin-link
              onClick={() => router.push('/admin')}
            >
              Admin
            </Button>
          ) : null}
          <Button
            type="button"
            size="md"
            mode="Second"
            className="nb-app-shell__avatar-button"
            data-nb-avatar-button
            aria-label="Account"
            onClick={() => setProfileOpen((v) => !v)}
          >
            {avatarUrl ? (
              <div style={{ position: 'relative', width: 28, height: 28, borderRadius: 999, overflow: 'hidden' }}>
                <Image src={avatarUrl} alt="" fill sizes="28px" style={{ objectFit: 'cover' }} unoptimized />
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
                  fontSize: 13,
                  fontWeight: 800,
                  background: 'rgba(0,0,0,0.06)',
                  color: 'rgba(0,0,0,0.7)',
                }}
              >
                {initial}
              </div>
            )}
          </Button>
        </div>
      </header>

      <div className="nb-app-shell__content" data-nb-content>
        <div className="nb-app-shell__page" data-nb-page>
          <div className="nb-app-shell__tabsbar" data-nb-tabsbar>
            {isRoomRoute ? (
              <div className="nb-app-shell__tabs" aria-label="Main">
                <Button type="button" mode="Second" size="md" onClick={() => router.push('/')}>
                  返回首页
                </Button>
              </div>
            ) : (
              <nav className="nb-app-shell__tabs" aria-label="Main">
                {tabItems.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="nb-app-shell__tab"
                    data-active={t.key === activeKey ? 'true' : undefined}
                    onClick={() => router.push(t.href)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
          <div className="nb-app-shell__page-body" data-nb-page-body>
            {children}
          </div>
        </div>

        {profileOpen ? (
          <aside className="nb-app-shell__profile-sidebar" data-nb-profile-sidebar>
            <div className="nb-app-shell__profile-sidebar-header" data-nb-profile-sidebar-header>
              <div className="nb-app-shell__profile-sidebar-title" data-nb-profile-sidebar-title>
                个人资料
              </div>
              <Button
                type="button"
                size="md"
                mode="NoBackground-Custom"
                className="nb-app-shell__profile-sidebar-close"
                aria-label="Close"
                iconLeft={{ name: 'symbol_wrongCircle', mode: 'fill', thickness: 'Standard' }}
                onClick={closeProfile}
              >
              </Button>
            </div>
            <div className="nb-app-shell__profile-sidebar-body" data-nb-profile-sidebar-body>
              <div className="nb-app-shell__profile-sidebar-avatar" data-nb-profile-sidebar-avatar>
                {shownAvatarUrl ? (
                  <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 999, overflow: 'hidden' }}>
                    <Image src={shownAvatarUrl} alt="" fill sizes="48px" style={{ objectFit: 'cover' }} unoptimized />
                  </div>
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 800,
                      background: 'rgba(0,0,0,0.06)',
                      color: 'rgba(0,0,0,0.7)',
                    }}
                  >
                    {shownInitial}
                  </div>
                )}
              </div>

              <div className="nb-app-shell__profile-sidebar-name" data-nb-profile-sidebar-name>
                {displayName || '未登录'}
              </div>
              {uid ? (
                <div className="nb-app-shell__profile-sidebar-id" data-nb-profile-sidebar-id>
                  {uid}
                </div>
              ) : null}

              {uid ? (
                <div className="nb-profile-editor" data-nb-profile-editor>
                  <div className="nb-profile-editor__section" data-nb-profile-editor-section>
                    <div className="nb-profile-editor__label">头像</div>
                    <div className="nb-profile-editor__row" data-nb-profile-editor-row>
                      <input
                        className="nb-profile-editor__file"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          setAvatarError(null);
                          const f = e.target.files?.[0] ?? null;
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = typeof reader.result === 'string' ? reader.result : null;
                            if (!dataUrl) return;
                            setAvatarPreview(dataUrl);
                          };
                          reader.readAsDataURL(f);
                        }}
                      />
                      <Button onClick={uploadAvatar} disabled={!avatarPreview || avatarSaving}>
                        {avatarSaving ? '上传中…' : '上传'}
                      </Button>
                      {avatarPreview ? (
                        <Button mode="Second" onClick={() => setAvatarPreview(null)} disabled={avatarSaving}>
                          取消预览
                        </Button>
                      ) : null}
                      <Button onClick={clearAvatar} disabled={!canClearAvatar || avatarSaving}>
                        {avatarSaving ? '处理中…' : '清除'}
                      </Button>
                    </div>
                    {avatarError ? <div className="nb-profile-editor__error">{avatarError}</div> : null}
                  </div>

                  <div className="nb-profile-editor__section" data-nb-profile-editor-section>
                    <div className="nb-profile-editor__label">显示名</div>
                    <div className="nb-profile-editor__row" data-nb-profile-editor-row>
                      <input
                        className="nb-profile-editor__input"
                        value={displayNameDraft}
                        onChange={(e) => setDisplayNameDraft(e.target.value)}
                        placeholder="例如：小明"
                      />
                      <Button onClick={saveDisplayName} disabled={!canSaveDisplayName || savingProfile}>
                        {savingProfile ? '保存中…' : '保存'}
                      </Button>
                    </div>
                    {profileError ? <div className="nb-profile-editor__error">{profileError}</div> : null}
                  </div>

                  <div className="nb-profile-editor__section" data-nb-profile-editor-section>
                    <div className="nb-profile-editor__label">好友</div>
                    <div className="nb-profile-editor__text" data-nb-profile-editor-text>
                      {friends.length ? friends.join(', ') : '暂无好友（可去“邀请好友”生成邀请码）'}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="nb-app-shell__profile-sidebar-actions" data-nb-profile-sidebar-actions>
                {!uid ? (
                  <Button mode="Primary" onClick={openLogin}>
                    去登录
                  </Button>
                ) : null}
                {uid ? (
                  <Button mode="NoBackground" onClick={() => signOut({ callbackUrl: '/' })}>
                    退出登录
                  </Button>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}

        <Dialog open={loginOpen} onOpenChange={setLoginOpen} title="登录" width={720}>
          <LoginView mode="modal" />
        </Dialog>
      </div>
    </div>
  );
}
