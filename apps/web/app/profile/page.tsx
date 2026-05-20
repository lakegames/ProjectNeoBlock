"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Button } from '@neoblock/ui';

type Profile = { id: string; displayName: string; createdAt: string; updatedAt: string };

export default function ProfilePage() {
  const { data } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const uid = (data?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    setError(null);
    setProfile(null);
    setFriends([]);
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

