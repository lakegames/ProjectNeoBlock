"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@neoblock/ui";

export default function JoinPage() {
  const router = useRouter();
  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id;

  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<"guest" | "account">("guest");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canJoin = useMemo(() => {
    const rc = roomCode.trim();
    if (!rc) return false;
    if (mode === "guest") return !!nickname.trim();
    return !!uid;
  }, [mode, nickname, roomCode, uid]);

  async function join() {
    if (!canJoin) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/room/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, nickname, mode }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "JOIN_FAILED");
      router.push(`/room/${encodeURIComponent(json.roomCode)}`);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>加入房间</h1>
      <p style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
        匿名：房间码 + 昵称；账号用户也可加入并与匿名共存（最小示例）
      </p>

      <div style={{ marginTop: 16 }}>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>身份模式</div>
        <div
          style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              checked={mode === "guest"}
              onChange={() => setMode("guest")}
              name="mode"
            />
            匿名加入
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              checked={mode === "account"}
              onChange={() => setMode("account")}
              name="mode"
              disabled={!uid}
            />
            账号加入（需登录）
          </label>
        </div>
        {!uid ? (
          <div style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
            未登录时无法选择“账号加入”
          </div>
        ) : (
          <div style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
            当前账号：{uid}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>房间信息</div>
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
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="房间码（例如 ABC123）"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              minWidth: 240,
            }}
          />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={
              mode === "guest" ? "匿名昵称（必填）" : "房间内昵称（可选）"
            }
            disabled={mode === "account" && !uid}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              minWidth: 240,
            }}
          />
          <Button onClick={join} disabled={!canJoin || loading}>
            {loading ? "加入中…" : "加入"}
          </Button>
        </div>
        {error ? (
          <div style={{ marginTop: 12, color: "#b42318" }}>{error}</div>
        ) : null}
      </div>
    </main>
  );
}
