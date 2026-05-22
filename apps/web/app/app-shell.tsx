"use client";

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@neoblock/ui';
import type { ReactNode } from 'react';

type ProfileSummary = {
  id: string;
  displayName: string;
  avatarKind?: 'custom' | 'github' | 'none';
  avatarUrl?: string | null;
};

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return '?';
  const last = s.at(-1);
  return last ? last.toUpperCase() : '?';
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  useEffect(() => {
    setProfile(null);
    if (!uid) return;
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setProfile((json.profile ?? null) as ProfileSummary | null);
      })
      .catch(() => {});
  }, [uid]);

  const displayName = profile?.displayName ?? data?.user?.name ?? data?.user?.email ?? '';
  const initial = useMemo(() => initialFor(displayName), [displayName]);
  const avatarUrl = profile?.avatarUrl ?? null;

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
          <div className="nb-app-shell__status" data-nb-status />
        </div>

        <div className="nb-app-shell__topbar-right" data-nb-topbar-right>
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
          <Button
            type="button"
            size="md"
            mode="Second"
            className="nb-app-shell__avatar-button"
            data-nb-avatar-button
            aria-label="Account"
            onClick={() => router.push(uid ? '/profile' : '/login')}
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
        {children}
      </div>
    </div>
  );
}
