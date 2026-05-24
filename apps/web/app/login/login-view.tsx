"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

import { Button } from "@neoblock/ui";

type Provider = { id: string; name: string };

export default function LoginView({ mode }: { mode: "page" | "modal" }) {
  const { data } = useSession();
  const [providers, setProviders] = useState<Record<string, Provider> | null>(
    null,
  );
  const [username, setUsername] = useState("");

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((p) => setProviders(p))
      .catch(() => setProviders({}));
  }, []);

  const providerList = useMemo(() => {
    if (!providers) return [];
    return Object.values(providers);
  }, [providers]);

  const body = (
    <>
      {mode === "page" ? <h1 style={{ margin: 0 }}>登录</h1> : null}
      <p
        style={{
          marginTop: mode === "page" ? 8 : 0,
          color: "rgba(0,0,0,0.65)",
        }}
      >
        使用 NextAuth(Auth.js) 接入的最小登录页
      </p>

      {mode === "page" ? (
        <div style={{ marginTop: 16 }}>
          <Link href="/">
            <Button>返回首页</Button>
          </Link>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>当前状态</div>
        <div style={{ marginTop: 8, color: "rgba(0,0,0,0.7)" }}>
          {data?.user
            ? `已登录：${data.user.name ?? data.user.email ?? "用户"}`
            : "未登录"}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button
            onClick={() =>
              signOut({ callbackUrl: mode === "page" ? "/login" : "/" })
            }
            disabled={!data?.user}
          >
            退出登录
          </Button>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>可用登录方式</div>
        <div
          style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          {providers === null ? (
            <div style={{ color: "rgba(0,0,0,0.65)" }}>加载中…</div>
          ) : providerList.length ? (
            providerList
              .filter((p) => p.id !== "credentials")
              .map((p) => (
                <Button
                  key={p.id}
                  onClick={() => signIn(p.id, { callbackUrl: "/" })}
                  disabled={!!data?.user}
                >
                  使用 {p.name} 登录
                </Button>
              ))
          ) : (
            <div style={{ color: "rgba(0,0,0,0.65)" }}>
              未检测到 OAuth Provider（可在 .env 中配置
              GITHUB_ID/GITHUB_SECRET）
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600 }}>Dev Credentials（可选）</div>
          <div style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
            设置环境变量 NEOBLOCK_DEV_CREDENTIALS=1 后可用
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                minWidth: 220,
              }}
            />
            <Button
              onClick={() =>
                signIn("credentials", { username, callbackUrl: "/" })
              }
              disabled={!!data?.user || !username.trim()}
            >
              使用用户名登录
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return mode === "page" ? (
    <main style={{ padding: 24, maxWidth: 720 }}>{body}</main>
  ) : (
    <div>{body}</div>
  );
}
