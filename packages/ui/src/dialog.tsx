"use client";

import * as React from 'react';
import { createPortal } from 'react-dom';

import { Button } from './button';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
};

function getFocusableElements(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  });
}

export function Dialog({ open, onOpenChange, title, description, children, footer, width = 520 }: DialogProps) {
  const [mounted, setMounted] = React.useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active ? focusable.indexOf(active) : -1;
      const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0) {
        e.preventDefault();
        focusable[focusable.length - 1]?.focus();
        return;
      }
      if (nextIndex >= focusable.length) {
        e.preventDefault();
        focusable[0]?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = getFocusableElements(panel);
    const el = focusable[0] ?? panel;
    queueMicrotask(() => el.focus());
    return () => {
      queueMicrotask(() => lastFocusedRef.current?.focus());
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          width,
          maxWidth: 'min(92vw, 720px)',
          background: 'var(--nb-color-surface, #fff)',
          border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
          borderRadius: 'var(--nb-radius-lg, 16px)',
          boxShadow: 'var(--nb-shadow-md, 0 8px 24px rgba(16,24,40,0.14))',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 14, display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {title ? (
              <div id={titleId} style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
                {title}
              </div>
            ) : null}
            {description ? (
              <div id={descriptionId} style={{ marginTop: 6, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 14, lineHeight: '20px' }}>
                {description}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)} aria-label="关闭弹窗">
            关闭
          </Button>
        </div>

        {children ? <div style={{ padding: 14, paddingTop: 0 }}>{children}</div> : null}

        {footer ? (
          <div
            style={{
              padding: 14,
              borderTop: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
