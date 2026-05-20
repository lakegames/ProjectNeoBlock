"use client";

import * as React from 'react';
import { createPortal } from 'react-dom';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  disabled?: boolean;
  openDelayMs?: number;
  side?: TooltipSide;
};

function mergeRefs<T>(a: React.Ref<T> | undefined, b: React.Ref<T> | undefined) {
  return (value: T) => {
    if (typeof a === 'function') a(value);
    else if (a && typeof a === 'object') (a as React.MutableRefObject<T>).current = value;

    if (typeof b === 'function') b(value);
    else if (b && typeof b === 'object') (b as React.MutableRefObject<T>).current = value;
  };
}

export function Tooltip({ content, children, disabled, openDelayMs = 200, side = 'top' }: TooltipProps) {
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => setMounted(true), []);

  const close = React.useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setOpen(false);
  }, []);

  const compute = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const w = 260;
    const h = 36;
    if (side === 'bottom') setPos({ left: r.left + r.width / 2 - w / 2, top: r.bottom + gap });
    else if (side === 'left') setPos({ left: r.left - w - gap, top: r.top + r.height / 2 - h / 2 });
    else if (side === 'right') setPos({ left: r.right + gap, top: r.top + r.height / 2 - h / 2 });
    else setPos({ left: r.left + r.width / 2 - w / 2, top: r.top - h - gap });
  }, [side]);

  const show = React.useCallback(() => {
    if (disabled) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      compute();
      setOpen(true);
    }, openDelayMs);
  }, [compute, disabled, openDelayMs]);

  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [compute, open]);

  const child = React.cloneElement(children, {
    ref: mergeRefs((children as { ref?: React.Ref<HTMLElement> }).ref, (v: HTMLElement | null) => {
      triggerRef.current = v;
    }),
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      close();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      close();
    },
  });

  return (
    <>
      {child}
      {mounted && open && pos
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: 'fixed',
                left: Math.round(pos.left),
                top: Math.round(pos.top),
                maxWidth: 260,
                padding: '8px 10px',
                borderRadius: 'var(--nb-radius-md, 12px)',
                background: 'rgba(15,23,42,0.92)',
                color: '#fff',
                fontSize: 12,
                lineHeight: '16px',
                pointerEvents: 'none',
                zIndex: 80,
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
