import "./globals.css";
import "./tokens.css";
import "./app-shell.css";
import "./ui/motion.css";
import "./ui/button.css";
import "./ui/input.css";
import "./ui/card.css";
import { Suspense } from "react";
import Providers from "./providers";
import AppShell from "./app-shell";

export const metadata = {
  title: "NeoBlock",
  description: "NeoBlock monorepo",
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
          {modal ?? null}
        </Providers>
      </body>
    </html>
  );
}
