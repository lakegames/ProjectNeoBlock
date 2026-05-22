"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Button } from '@neoblock/ui';

type Profile = {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  avatarKind?: 'custom' | 'github' | 'none';
  avatarUrl?: string | null;
};

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return '?';
  const last = s.at(-1);
  return last ? last.toUpperCase() : '?';
}

export default function ProfilePage() {
  const { data } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const uid = (data?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    setError(null);
    setProfile(null);
    setFriends([]);
    setAvatarPreview(null);
    setAvatarError(null);
    if (!uid) return;

    fetch('/api/profile')
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || 'LOAD_FAILED');
        return json as { profile: Profile; friends: string[] };
      })
      .then((res) => {
        setProfile(res.profile);
        setFriends(res.friends);
        setDisplayName(res.profile.displayName);
      })
      .catch((e) => setError(String(e?.message || e)));
  }, [uid]);

  const canSave = useMemo(() => {
    if (!uid) return false;
    const name = displayName.trim();
    if (!name || name.length > 40) return false;
    if (!profile) return true;
    return name !== profile.displayName;
  }, [displayName, profile, uid]);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'SAVE_FAILED');
      setProfile(json.profile);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
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
      setProfile((json.profile ?? null) as Profile | null);
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
      setProfile((json.profile ?? null) as Profile | null);
      setAvatarPreview(null);
    } catch (e) {
      setAvatarError(String((e as Error).message || e));
    } finally {
      setAvatarSaving(false);
    }
  }

  const shownAvatarUrl = avatarPreview ?? profile?.avatarUrl ?? null;
  const shownInitial = initialFor(profile?.displayName ?? displayName ?? uid ?? '');
  const canClearAvatar = (profile?.avatarKind ?? 'none') === 'custom';

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>账号资料</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
        最小资料字段：displayName；朋友通过邀请码建立
      </p>

      <div style={{ marginTop: 16 }}>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
      </div>

      {!uid ? (
        <div style={{ marginTop: 20, color: 'rgba(0,0,0,0.7)' }}>请先登录</div>
      ) : (
        <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>用户ID</div>
            <div style={{ color: 'rgba(0,0,0,0.65)' }}>{uid}</div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600 }}>头像</div>
            <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.12)',
                  background: 'rgba(0,0,0,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  fontWeight: 800,
                  fontSize: 22,
                  color: 'rgba(0,0,0,0.7)',
                }}
              >
                {shownAvatarUrl ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src={shownAvatarUrl} alt="" fill sizes="72px" style={{ objectFit: 'cover' }} unoptimized />
                  </div>
                ) : (
                  shownInitial
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
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
                  <Button
                    mode="Second"
                    onClick={() => setAvatarPreview(null)}
                    disabled={avatarSaving}
                  >
                    取消预览
                  </Button>
                ) : null}
                <Button onClick={clearAvatar} disabled={!canClearAvatar || avatarSaving}>
                  {avatarSaving ? '处理中…' : '清除'}
                </Button>
              </div>
            </div>
            {avatarError ? <div style={{ marginTop: 10, color: '#b42318' }}>{avatarError}</div> : null}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600 }}>显示名</div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：小明"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.12)',
                  minWidth: 260,
                }}
              />
              <Button onClick={save} disabled={!canSave || saving}>
                保存
              </Button>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600 }}>好友</div>
            <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
              {friends.length ? friends.join(', ') : '暂无好友（可去“邀请好友”生成邀请码）'}
            </div>
          </div>

          {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
        </div>
      )}
    </main>
  );
}
