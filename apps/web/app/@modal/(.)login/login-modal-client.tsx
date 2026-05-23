"use client";

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Dialog } from '@neoblock/ui';

import LoginView from '../../login/login-view';

export default function LoginModalClient() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        const canGoBack =
          typeof window !== 'undefined' &&
          typeof window.history.state?.idx === 'number' &&
          window.history.state.idx > 0;
        if (canGoBack) router.back();
        else router.replace('/');
      }
    },
    [router],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="登录" width={720}>
      <LoginView mode="modal" />
    </Dialog>
  );
}
