"use client";

import * as React from 'react';
import { createPortal } from 'react-dom';

import { Button } from './button';

export type DrawerSide = 'right' | 'left' | 'bottom';

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  width?: number | string;
  side?: DrawerSide;
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

export function Drawer({ open, onOpenChange, title, children, width = 420, side = 'right' }: DrawerProps) {
  const [mounted, setMounted] = React.useState(false);
  const titleId = React.useId();
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

  const panelStyle: React.CSSProperties =
    side === 'bottom'
      ? {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: width,
          maxHeight: '92vh',
          borderTopLeftRadius: 'var(--nb-radius-lg, 16px)',
          borderTopRightRadius: 'var(--nb-radius-lg, 16px)',
        }
      : side === 'left'
        ? {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width,
            maxWidth: '92vw',
            borderTopRightRadius: 'var(--nb-radius-lg, 16px)',
            borderBottomRightRadius: 'var(--nb-radius-lg, 16px)',
          }
        : {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width,
            maxWidth: '92vw',
            borderTopLeftRadius: 'var(--nb-radius-lg, 16px)',
            borderBottomLeftRadius: 'var(--nb-radius-lg, 16px)',
          };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        zIndex: 60,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          ...panelStyle,
          background: 'var(--nb-color-surface, #fff)',
          border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
          boxShadow: 'var(--nb-shadow-md, 0 8px 24px rgba(16,24,40,0.14))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {title ? (
            <div id={titleId} style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
              {title}
            </div>
          ) : (
            <div />
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} aria-label="关闭抽屉">
            关闭
          </Button>
        </div>
        <div style={{ padding: 14, paddingTop: 0, overflow: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
