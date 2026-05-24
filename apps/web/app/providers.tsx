"use client";

import { SessionProvider } from "next-auth/react";

import { ThemeProvider } from "@neoblock/ui";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        style={{
          minHeight: "100vh",
          background: "var(--nb-color-bg, #f8fafc)",
          color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
        }}
      >
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
