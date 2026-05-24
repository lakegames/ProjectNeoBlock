"use client";

import * as React from "react";
import { createPortal } from "react-dom";

export type PopoverSide = "top" | "bottom" | "left" | "right";

export type PopoverProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: PopoverSide;
};

function mergeRefs<T>(
  a: React.Ref<T> | undefined,
  b: React.Ref<T> | undefined,
) {
  return (value: T) => {
    if (typeof a === "function") a(value);
    else if (a && typeof a === "object")
      (a as React.MutableRefObject<T>).current = value;

    if (typeof b === "function") b(value);
    else if (b && typeof b === "object")
      (b as React.MutableRefObject<T>).current = value;
  };
}

function getFocusableElements(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  });
}

function computePos(side: PopoverSide, triggerRect: DOMRect, popRect: DOMRect) {
  const gap = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = 0;
  let top = 0;
  if (side === "bottom") {
    left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
    top = triggerRect.bottom + gap;
  } else if (side === "top") {
    left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
    top = triggerRect.top - popRect.height - gap;
  } else if (side === "left") {
    left = triggerRect.left - popRect.width - gap;
    top = triggerRect.top + triggerRect.height / 2 - popRect.height / 2;
  } else {
    left = triggerRect.right + gap;
    top = triggerRect.top + triggerRect.height / 2 - popRect.height / 2;
  }

  left = Math.max(8, Math.min(left, viewportW - popRect.width - 8));
  top = Math.max(8, Math.min(top, viewportH - popRect.height - 8));
  return { left, top };
}

export function Popover({
  content,
  children,
  open,
  defaultOpen,
  onOpenChange,
  side = "bottom",
}: PopoverProps) {
  const [mounted, setMounted] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(!!defaultOpen);
  const mergedOpen = typeof open === "boolean" ? open : uncontrolledOpen;
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  React.useEffect(() => setMounted(true), []);

  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (typeof open !== "boolean") setUncontrolledOpen(next);
    },
    [onOpenChange, open],
  );

  const compute = React.useCallback(() => {
    const t = triggerRef.current;
    const p = panelRef.current;
    if (!t || !p) return;
    const tr = t.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    setPos(computePos(side, tr, pr));
  }, [side]);

  React.useEffect(() => {
    if (!mergedOpen) return;
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [compute, mergedOpen]);

  React.useEffect(() => {
    if (!mergedOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mergedOpen, setOpen]);

  React.useEffect(() => {
    if (!mergedOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = triggerRef.current;
      const p = panelRef.current;
      if (!t || !p) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (t.contains(target)) return;
      if (p.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown, true);
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, [mergedOpen, setOpen]);

  React.useEffect(() => {
    if (!mergedOpen) return;
    queueMicrotask(() => {
      compute();
      const p = panelRef.current;
      if (!p) return;
      const focusable = getFocusableElements(p);
      (focusable[0] ?? p).focus();
    });
  }, [compute, mergedOpen]);

  React.useEffect(() => {
    if (mergedOpen) return;
    queueMicrotask(() => triggerRef.current?.focus());
  }, [mergedOpen]);

  const child = React.cloneElement(children, {
    ref: mergeRefs(
      (children as { ref?: React.Ref<HTMLElement> }).ref,
      (v: HTMLElement | null) => {
        triggerRef.current = v;
      },
    ),
    "aria-expanded": mergedOpen ? true : undefined,
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!mergedOpen);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      children.props.onKeyDown?.(e);
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(!mergedOpen);
      }
    },
  });

  return (
    <>
      {child}
      {mounted && mergedOpen
        ? createPortal(
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              style={{
                position: "fixed",
                left: pos ? Math.round(pos.left) : -10_000,
                top: pos ? Math.round(pos.top) : -10_000,
                zIndex: 90,
                minWidth: 240,
                maxWidth: 360,
                maxHeight: "min(60vh, 520px)",
                overflow: "auto",
                padding: 12,
                borderRadius: "var(--nb-radius-md, 12px)",
                background: "var(--nb-color-surface, #fff)",
                border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
                boxShadow:
                  "var(--nb-shadow-md, 0 8px 24px rgba(16,24,40,0.14))",
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
