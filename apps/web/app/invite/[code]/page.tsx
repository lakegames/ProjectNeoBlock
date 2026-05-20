"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@neoblock/ui';

export default function InviteAcceptPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const code = useMemo(() => String(params?.code || '').trim().toUpperCase(), [params]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setStatus('loading');
    setError(null);
    try {
      const r = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'ACCEPT_FAILED');
      setStatus('ok');
    } catch (e) {
      setStatus('error');
      setError(String((e as Error).message || e));
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>接受邀请</h1>
      <p style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>邀请码：{code || '-'}</p>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
        <Link href="/invite">
          <Button>返回邀请页</Button>
        </Link>
      </div>

      <div style={{ marginTop: 20, padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
        {!uid ? (
          <div>
            <div style={{ color: 'rgba(0,0,0,0.7)' }}>请先登录后再接受邀请</div>
            <div style={{ marginTop: 12 }}>
              <Link href={`/login`}>
                <Button>去登录</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ color: 'rgba(0,0,0,0.7)' }}>当前账号：{uid}</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button onClick={accept} disabled={!code || status === 'loading' || status === 'ok'}>
                {status === 'loading' ? '处理中…' : status === 'ok' ? '已接受' : '接受邀请'}
              </Button>
              <Button onClick={() => router.push('/profile')}>查看好友列表</Button>
            </div>
          </div>
        )}
        {error ? <div style={{ marginTop: 12, color: '#b42318' }}>{error}</div> : null}
      </div>
    </main>
  );
}

