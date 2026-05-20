"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Button } from '@neoblock/ui';

export default function InvitePage() {
  const { data } = useSession();
  const router = useRouter();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [last, setLast] = useState<{ code: string; link: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/invite/create', { method: 'POST' });
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
      <h1 style={{ margin: 0 }}>邀请好友</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
        最小能力：生成邀请码/链接；对方登录后接受邀请即成为好友
      </p>

      <div style={{ marginTop: 16 }}>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        <div style={{ fontWeight: 600 }}>生成邀请码</div>
        {!uid ? (
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.7)' }}>请先登录</div>
        ) : (
          <div style={{ marginTop: 12 }}>
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

      {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
    </main>
  );
}

