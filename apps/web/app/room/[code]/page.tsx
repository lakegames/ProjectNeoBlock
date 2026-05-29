"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { Button, Dialog, Input, Popover, Tooltip } from "@neoblock/ui";

import { clearActiveGame, writeActiveGame } from "../../../lib/active-game";

import { BoardSkeleton } from "./board-skeleton";
import { useRoomConnection } from "./use-room-connection";

type RoomConfig = {
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  rulesetVersionId?: string | undefined;
  boardVersionId?: string | undefined;
  cardsVersionId?: string | undefined;
};
type RoomMember = {
  playerId: string;
  userId?: string;
  displayName: string;
  isSpectator: boolean;
  ready: boolean;
  joinedAtMs: number;
};
type Room = {
  code: string;
  roomId: string;
  status: "lobby" | "playing" | "ended";
  hostPlayerId: string;
  createdAtMs: number;
  startedAtMs?: number;
  config: RoomConfig;
  members: RoomMember[];
};

type Self = {
  playerId: string;
  isSpectator: boolean;
  displayName: string;
  ready: boolean;
};

type PublishedConfigItem = {
  docId: string;
  name: string;
  versionId: string;
  updatedAtMs: number;
};

type PublicProfile = {
  id: string;
  displayName: string;
  avatarKind: "custom" | "github" | "none";
  avatarUrl: string | null;
};

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return "?";
  const last = s.at(-1);
  return last ? last.toUpperCase() : "?";
}

function validateConfig(input: { maxPlayers: number; turnTimeSec: number }) {
  if (
    !Number.isInteger(input.maxPlayers) ||
    input.maxPlayers < 2 ||
    input.maxPlayers > 16
  ) {
    return "玩家上限范围：2-16（整数）";
  }
  if (
    !Number.isInteger(input.turnTimeSec) ||
    input.turnTimeSec < 10 ||
    input.turnTimeSec > 600
  ) {
    return "回合时间范围：10-600（整数秒）";
  }
  return null;
}

function LegacyRoomPage() {
  const params = useParams<{ code: string }>();
  const roomCode = useMemo(
    () =>
      String(params?.code || "")
        .trim()
        .toUpperCase(),
    [params],
  );
  const searchParams = useSearchParams();
  const wantSpectate = searchParams.get("spectate") === "1";

  const [room, setRoom] = useState<Room | null>(null);
  const [self, setSelf] = useState<Self | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [spectateLoading, setSpectateLoading] = useState(false);
  const [spectateError, setSpectateError] = useState<string | null>(null);
  const [spectateNickname, setSpectateNickname] = useState("");
  const [didAutoSpectate, setDidAutoSpectate] = useState(false);

  const [configDraft, setConfigDraft] = useState<RoomConfig>({
    maxPlayers: 4,
    turnTimeSec: 60,
    enableAuto: false,
    enableAI: false,
    rulesetVersionId: undefined,
    boardVersionId: undefined,
    cardsVersionId: undefined,
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [publishedRules, setPublishedRules] = useState<PublishedConfigItem[]>(
    [],
  );
  const [publishedBoards, setPublishedBoards] = useState<PublishedConfigItem[]>(
    [],
  );
  const [publishedCards, setPublishedCards] = useState<PublishedConfigItem[]>(
    [],
  );

  const [readyLoading, setReadyLoading] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);

  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function refresh() {
    if (!roomCode) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/room/state?roomCode=${encodeURIComponent(roomCode)}`,
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "LOAD_FAILED");
      setRoom((json.room ?? null) as Room | null);
      setSelf((json.self ?? null) as Self | null);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [roomCode]);

  useEffect(() => {
    if (!room) return;
    setConfigDraft(room.config);
  }, [room?.code, room?.status]);

  useEffect(() => {
    fetch("/api/config/published", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setPublishedRules((json.rules ?? []) as PublishedConfigItem[]);
        setPublishedBoards((json.boards ?? []) as PublishedConfigItem[]);
        setPublishedCards((json.cards ?? []) as PublishedConfigItem[]);
      })
      .catch(() => {});
  }, []);

  async function spectate() {
    if (!roomCode || spectateLoading) return;
    setSpectateLoading(true);
    setSpectateError(null);
    try {
      const r = await fetch("/api/room/spectate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, nickname: spectateNickname }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "SPECTATE_FAILED");
      await refresh();
    } catch (e) {
      setSpectateError(String((e as Error).message || e));
    } finally {
      setSpectateLoading(false);
    }
  }

  useEffect(() => {
    if (!wantSpectate || didAutoSpectate || !roomCode) return;
    if (self) {
      setDidAutoSpectate(true);
      return;
    }
    if (room) {
      setDidAutoSpectate(true);
      spectate();
    }
  }, [didAutoSpectate, room, roomCode, self, wantSpectate]);

  const players = useMemo(
    () => (room?.members ?? []).filter((m) => !m.isSpectator),
    [room?.members],
  );
  const spectators = useMemo(
    () => (room?.members ?? []).filter((m) => m.isSpectator),
    [room?.members],
  );
  const host = useMemo(
    () =>
      room
        ? (room.members.find((m) => m.playerId === room.hostPlayerId) ?? null)
        : null,
    [room],
  );
  const isHost =
    !!room &&
    !!self &&
    self.playerId === room.hostPlayerId &&
    !self.isSpectator;

  const notReadyPlayers = useMemo(
    () => players.filter((p) => !p.ready),
    [players],
  );
  const startDisabledReason = useMemo(() => {
    if (!room) return "房间不存在";
    if (!self) return "未加入房间";
    if (!isHost) return "仅房主可开局";
    if (room.status !== "lobby") return "已开局，参数已锁定";
    if (players.length < 2) return "至少需要 2 名玩家";
    if (notReadyPlayers.length)
      return `仍有 ${notReadyPlayers.length} 名玩家未准备`;
    return null;
  }, [isHost, notReadyPlayers.length, players.length, room, self]);

  async function setReady(nextReady: boolean) {
    if (!roomCode || !self || self.isSpectator || readyLoading) return;
    setReadyLoading(true);
    setReadyError(null);
    try {
      const r = await fetch("/api/room/ready", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, ready: nextReady }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "READY_FAILED");
      await refresh();
    } catch (e) {
      setReadyError(String((e as Error).message || e));
    } finally {
      setReadyLoading(false);
    }
  }

  async function saveConfig() {
    if (!room || !self || !isHost || room.status !== "lobby" || configSaving)
      return;
    const err = validateConfig({
      maxPlayers: configDraft.maxPlayers,
      turnTimeSec: configDraft.turnTimeSec,
    });
    if (err) {
      setConfigError(err);
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    try {
      const r = await fetch("/api/room/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, config: configDraft }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "CONFIG_FAILED");
      await refresh();
    } catch (e) {
      setConfigError(String((e as Error).message || e));
    } finally {
      setConfigSaving(false);
    }
  }

  async function startGame() {
    if (!room || !self || !isHost || startLoading) return;
    setStartLoading(true);
    setStartError(null);
    try {
      const r = await fetch("/api/room/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "START_FAILED");
      await refresh();
    } catch (e) {
      setStartError(String((e as Error).message || e));
    } finally {
      setStartLoading(false);
    }
  }

  return (
    <main
      style={{ padding: 24, maxWidth: room?.status === "playing" ? 1240 : 720 }}
    >
      <h1 style={{ margin: 0 }}>房间 {roomCode || "-"}</h1>
      <p style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
        房间页：玩家列表、准备/取消、房主开局、观战入口；房间参数表单+校验；开局锁定
      </p>

      <div
        style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
        <Link href="/join">
          <Button>作为玩家加入</Button>
        </Link>
        <Button onClick={refresh} disabled={loading}>
          {loading ? "刷新中…" : "刷新房间状态"}
        </Button>
        <Link href={`/room/${encodeURIComponent(roomCode)}?spectate=1`}>
          <Button>观战链接</Button>
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
        <div style={{ fontWeight: 600 }}>房间信息</div>
        {room ? (
          <div style={{ marginTop: 10, color: "rgba(0,0,0,0.7)" }}>
            状态：{room.status} ｜房主：{host?.displayName ?? room.hostPlayerId}{" "}
            ｜玩家 {players.length}/{room.config.maxPlayers} ｜观战{" "}
            {spectators.length}
            <div style={{ marginTop: 8 }}>
              参数：回合 {room.config.turnTimeSec}s｜托管{" "}
              {room.config.enableAuto ? "开" : "关"}｜AI{" "}
              {room.config.enableAI ? "开" : "关"}
            </div>
            <div style={{ marginTop: 8 }}>
              配置版本：规则 {room.config.rulesetVersionId ?? "-"}｜棋盘{" "}
              {room.config.boardVersionId ?? "-"}｜卡牌{" "}
              {room.config.cardsVersionId ?? "-"}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
            房间不存在或尚未加载
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
        <div style={{ fontWeight: 600 }}>我的状态</div>
        <div style={{ marginTop: 10, color: "rgba(0,0,0,0.7)" }}>
          {self ? (
            <>
              {self.isSpectator ? "观战" : "玩家"}：{self.displayName}（
              {self.playerId}）
              {!self.isSpectator && room?.status === "lobby" ? (
                <span> ｜{self.ready ? "已准备" : "未准备"}</span>
              ) : null}
              {isHost ? <span> ｜房主</span> : null}
            </>
          ) : (
            <>未加入（可作为玩家加入或观战）</>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button
            onClick={() => setReady(!self?.ready)}
            disabled={
              !room ||
              !self ||
              self.isSpectator ||
              room.status !== "lobby" ||
              readyLoading
            }
          >
            {readyLoading ? "处理中…" : self?.ready ? "取消准备" : "准备"}
          </Button>
          <Button
            onClick={startGame}
            disabled={!!startDisabledReason || startLoading}
          >
            {startLoading
              ? "开局中…"
              : startDisabledReason
                ? `开局（${startDisabledReason}）`
                : "房主开局"}
          </Button>
        </div>
        {readyError ? (
          <div style={{ marginTop: 10, color: "#b42318" }}>{readyError}</div>
        ) : null}
        {startError ? (
          <div style={{ marginTop: 10, color: "#b42318" }}>{startError}</div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>玩家列表</div>
        <div style={{ marginTop: 10 }}>
          {players.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {players.map((p) => (
                <li key={p.playerId} style={{ marginTop: 6 }}>
                  {p.displayName}
                  {p.playerId === room?.hostPlayerId ? "（房主）" : ""}｜
                  {room?.status === "lobby"
                    ? p.ready
                      ? "已准备"
                      : "未准备"
                    : "对局中"}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无玩家</div>
          )}
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
        <div style={{ fontWeight: 600 }}>观战列表</div>
        <div style={{ marginTop: 10 }}>
          {spectators.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {spectators.map((p) => (
                <li key={p.playerId} style={{ marginTop: 6 }}>
                  {p.displayName}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无观战</div>
          )}
        </div>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Input
            value={spectateNickname}
            onChange={(e) => setSpectateNickname(e.target.value)}
            placeholder="观战昵称（可选）"
            style={{ minWidth: 240 }}
          />
          <Button onClick={spectate} disabled={!room || spectateLoading}>
            {spectateLoading
              ? "加入中…"
              : self?.isSpectator
                ? "刷新观战身份"
                : "加入观战"}
          </Button>
        </div>
        {spectateError ? (
          <div style={{ marginTop: 10, color: "#b42318" }}>{spectateError}</div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>房间参数</div>
        <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
          {room?.status === "lobby"
            ? "未开局：房主可修改，保存后对新加入生效"
            : "已开局：参数已锁定"}
        </div>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={configDraft.rulesetVersionId ?? ""}
            onChange={(e) =>
              setConfigDraft((c) => ({
                ...c,
                rulesetVersionId: e.target.value || undefined,
              }))
            }
            disabled={!room || !isHost || room.status !== "lobby"}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              minWidth: 260,
              opacity: !room || !isHost || room.status !== "lobby" ? 0.6 : 1,
            }}
          >
            <option value="">规则版本（未选择）</option>
            {publishedRules.map((x) => (
              <option key={x.versionId} value={x.versionId}>
                {x.name}（{x.versionId}）
              </option>
            ))}
          </select>
          <select
            value={configDraft.boardVersionId ?? ""}
            onChange={(e) =>
              setConfigDraft((c) => ({
                ...c,
                boardVersionId: e.target.value || undefined,
              }))
            }
            disabled={!room || !isHost || room.status !== "lobby"}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              minWidth: 260,
              opacity: !room || !isHost || room.status !== "lobby" ? 0.6 : 1,
            }}
          >
            <option value="">棋盘版本（未选择）</option>
            {publishedBoards.map((x) => (
              <option key={x.versionId} value={x.versionId}>
                {x.name}（{x.versionId}）
              </option>
            ))}
          </select>
          <select
            value={configDraft.cardsVersionId ?? ""}
            onChange={(e) =>
              setConfigDraft((c) => ({
                ...c,
                cardsVersionId: e.target.value || undefined,
              }))
            }
            disabled={!room || !isHost || room.status !== "lobby"}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              minWidth: 260,
              opacity: !room || !isHost || room.status !== "lobby" ? 0.6 : 1,
            }}
          >
            <option value="">卡牌版本（未选择）</option>
            {publishedCards.map((x) => (
              <option key={x.versionId} value={x.versionId}>
                {x.name}（{x.versionId}）
              </option>
            ))}
          </select>
          <Input
            value={String(configDraft.maxPlayers)}
            onChange={(e) =>
              setConfigDraft((c) => ({
                ...c,
                maxPlayers: Number(e.target.value),
              }))
            }
            type="number"
            min={2}
            max={16}
            step={1}
            disabled={!room || !isHost || room.status !== "lobby"}
            style={{ width: 160 }}
          />
          <Input
            value={String(configDraft.turnTimeSec)}
            onChange={(e) =>
              setConfigDraft((c) => ({
                ...c,
                turnTimeSec: Number(e.target.value),
              }))
            }
            type="number"
            min={10}
            max={600}
            step={1}
            disabled={!room || !isHost || room.status !== "lobby"}
            style={{ width: 160 }}
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={configDraft.enableAuto}
              onChange={(e) =>
                setConfigDraft((c) => ({ ...c, enableAuto: e.target.checked }))
              }
              disabled={!room || !isHost || room.status !== "lobby"}
            />
            托管
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={configDraft.enableAI}
              onChange={(e) =>
                setConfigDraft((c) => ({ ...c, enableAI: e.target.checked }))
              }
              disabled={!room || !isHost || room.status !== "lobby"}
            />
            AI
          </label>
          <Button
            onClick={saveConfig}
            disabled={
              !room || !isHost || room.status !== "lobby" || configSaving
            }
          >
            {configSaving ? "保存中…" : "保存参数"}
          </Button>
        </div>
        {configError ? (
          <div style={{ marginTop: 10, color: "#b42318" }}>{configError}</div>
        ) : null}
      </div>

      {room?.status === "playing" ? (
        <BoardSkeleton
          players={players.map((p) => ({
            playerId: p.playerId,
            displayName: p.displayName,
          }))}
          selfPlayerId={self?.playerId ?? null}
        />
      ) : null}

      {error ? (
        <div style={{ marginTop: 12, color: "#b42318" }}>{error}</div>
      ) : null}
    </main>
  );
}

void LegacyRoomPage;

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const roomCode = useMemo(
    () =>
      String(params?.code || "")
        .trim()
        .toUpperCase(),
    [params],
  );
  const searchParams = useSearchParams();
  const wantSpectate = searchParams.get("spectate") === "1";

  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveConfirmLoading, setLeaveConfirmLoading] = useState(false);
  const [spectatorsOpen, setSpectatorsOpen] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const { data } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id ?? null;
  const [friends, setFriends] = useState<string[]>([]);
  useEffect(() => {
    setFriends([]);
    if (!uid) return;
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setFriends((json.friends ?? []) as string[]);
      })
      .catch(() => {});
  }, [uid]);

  const [publishedTemplates, setPublishedTemplates] = useState<
    PublishedConfigItem[]
  >([]);
  const [defaultTemplateVersionId, setDefaultTemplateVersionId] =
    useState<string>("");
  useEffect(() => {
    fetch("/api/config/published", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        setPublishedTemplates((json.templates ?? []) as PublishedConfigItem[]);
        setDefaultTemplateVersionId(
          typeof json.defaultTemplateVersionId === "string"
            ? json.defaultTemplateVersionId
            : "",
        );
      })
      .catch(() => {});
  }, []);

  const {
    actor,
    snapshot,
    connected,
    connecting,
    lastError,
    sendCommand,
    pending,
    lastCardDrawn,
    clearLastCard,
    getDebugDump,
    chatMessages,
    recentEvents50,
  } = useRoomConnection({
    roomCode,
    mode: wantSpectate ? "spectator" : "player",
  });

  const room = snapshot?.room ?? null;
  const game = snapshot?.game ?? null;
  const isGameEnded = game?.status === "ended";

  const selfMember = useMemo(() => {
    if (!actor || !room) return null;
    return room.members.find((m) => m.playerId === actor.playerId) ?? null;
  }, [actor, room]);

  useEffect(() => {
    if (!roomCode) return;
    if (game?.status === "playing" && selfMember && !selfMember.isSpectator) {
      writeActiveGame(roomCode);
    } else if (selfMember && !selfMember.isSpectator) {
      clearActiveGame();
    }
  }, [game?.status, roomCode, selfMember]);

  const players = useMemo(
    () => (room?.members ?? []).filter((m) => !m.isSpectator),
    [room?.members],
  );
  const spectators = useMemo(
    () => (room?.members ?? []).filter((m) => m.isSpectator),
    [room?.members],
  );
  const host = useMemo(
    () =>
      room
        ? (room.members.find((m) => m.playerId === room.hostPlayerId) ?? null)
        : null,
    [room],
  );

  const userIdsKey = useMemo(() => {
    const ids = [
      ...new Set(
        (room?.members ?? [])
          .map((m) => m.userId)
          .filter((x): x is string => !!x),
      ),
    ];
    ids.sort();
    return ids.join(",");
  }, [room?.members]);
  const [publicProfiles, setPublicProfiles] = useState<
    Record<string, PublicProfile>
  >({});
  useEffect(() => {
    const ids = userIdsKey ? userIdsKey.split(",").filter(Boolean) : [];
    if (!ids.length) {
      setPublicProfiles({});
      return;
    }
    fetch(`/api/profile/public?ids=${encodeURIComponent(ids.join(","))}`, {
      cache: "no-store",
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        const list = (json.profiles ?? []) as PublicProfile[];
        const map: Record<string, PublicProfile> = {};
        for (const p of list) map[p.id] = p;
        setPublicProfiles(map);
      })
      .catch(() => {});
  }, [userIdsKey]);

  const isHost =
    !!room &&
    !!actor &&
    actor.playerId === room.hostPlayerId &&
    !selfMember?.isSpectator;

  const [webRoomAvailable, setWebRoomAvailable] = useState(true);
  const [webTemplateVersionId, setWebTemplateVersionId] = useState<string>("");
  async function refreshWebTemplate() {
    if (!roomCode || !webRoomAvailable) return;
    try {
      const r = await fetch(
        `/api/room/state?roomCode=${encodeURIComponent(roomCode)}`,
        { cache: "no-store" },
      );
      const json = (await r.json().catch(() => null)) as {
        error?: unknown;
        room?: { config?: { templateVersionId?: unknown } };
      } | null;
      if (!r.ok) {
        const err = typeof json?.error === "string" ? json.error : "";
        if (err === "ROOM_NOT_FOUND" || err === "ROOM_CLOSED")
          setWebRoomAvailable(false);
        return;
      }
      const v = json?.room?.config?.templateVersionId;
      setWebTemplateVersionId(typeof v === "string" ? v : "");
    } catch {
      void 0;
    }
  }
  useEffect(() => {
    setWebTemplateVersionId("");
    void refreshWebTemplate();
  }, [roomCode]);

  const [selectedTemplateVersionId, setSelectedTemplateVersionId] =
    useState("");
  useEffect(() => {
    if (webTemplateVersionId) {
      const canSelect = publishedTemplates.some(
        (t) => t.versionId === webTemplateVersionId,
      );
      setSelectedTemplateVersionId(canSelect ? webTemplateVersionId : "");
      return;
    }
    if (!selectedTemplateVersionId && publishedTemplates[0]?.versionId)
      setSelectedTemplateVersionId(publishedTemplates[0].versionId);
  }, [
    defaultTemplateVersionId,
    publishedTemplates,
    selectedTemplateVersionId,
    webTemplateVersionId,
  ]);

  const currentTemplateLabel = useMemo(() => {
    if (!webTemplateVersionId) return "";
    if (
      defaultTemplateVersionId &&
      webTemplateVersionId === defaultTemplateVersionId
    )
      return "标准玩法";
    const hit = publishedTemplates.find(
      (t) => t.versionId === webTemplateVersionId,
    );
    return hit ? hit.name : webTemplateVersionId;
  }, [defaultTemplateVersionId, publishedTemplates, webTemplateVersionId]);

  const [applyTemplateLoading, setApplyTemplateLoading] = useState(false);
  const [applyTemplateError, setApplyTemplateError] = useState<string | null>(
    null,
  );
  async function applyTemplate() {
    if (!roomCode || !selectedTemplateVersionId || applyTemplateLoading) return;
    setApplyTemplateLoading(true);
    setApplyTemplateError(null);
    try {
      const r = await fetch("/api/room/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode,
          config: { templateVersionId: selectedTemplateVersionId },
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "APPLY_TEMPLATE_FAILED");
      await refreshWebTemplate();
      await syncRoomConfigToWs();
    } catch (e) {
      setApplyTemplateError(String((e as Error).message || e));
    } finally {
      setApplyTemplateLoading(false);
    }
  }

  const [syncError, setSyncError] = useState<string | null>(null);
  const [startRequested, setStartRequested] = useState(false);
  const lastSyncKeyRef = useRef("");
  const desiredConfigRef = useRef<null | {
    maxPlayers: number | null;
    boardPreset: "default" | "full" | null;
  }>(null);
  async function syncRoomConfigToWs() {
    if (!roomCode || !room || !actor || !isHost) return;
    if (!webRoomAvailable) return;
    if (room.status !== "lobby") return;
    if (pending) return;
    setSyncError(null);
    try {
      const stateResp = await fetch(
        `/api/room/state?roomCode=${encodeURIComponent(roomCode)}`,
        { cache: "no-store" },
      );
      const stateJson = (await stateResp.json().catch(() => null)) as {
        error?: unknown;
        room?: { config?: { maxPlayers?: unknown; boardVersionId?: unknown } };
      } | null;
      if (!stateResp.ok) {
        const err = typeof stateJson?.error === "string" ? stateJson.error : "";
        if (err === "ROOM_NOT_FOUND" || err === "ROOM_CLOSED") {
          setWebRoomAvailable(false);
          desiredConfigRef.current = null;
          lastSyncKeyRef.current = "no-web-room";
          return;
        }
        throw new Error(err || "ROOM_STATE_FAILED");
      }

      const maxPlayersRaw = stateJson?.room?.config?.maxPlayers;
      const maxPlayers =
        typeof maxPlayersRaw === "number" && Number.isFinite(maxPlayersRaw)
          ? Math.trunc(maxPlayersRaw)
          : null;
      const boardVersionIdRaw = stateJson?.room?.config?.boardVersionId;
      const boardVersionId =
        typeof boardVersionIdRaw === "string" ? boardVersionIdRaw : null;

      let boardPreset: "default" | "full" | null = null;
      if (boardVersionId) {
        const pubResp = await fetch("/api/config/published", {
          cache: "no-store",
        });
        const pubJson = (await pubResp.json().catch(() => null)) as {
          boards?: { docId?: unknown; versionId?: unknown }[];
        } | null;
        const boards = Array.isArray(pubJson?.boards) ? pubJson!.boards! : [];
        const hit =
          boards.find(
            (b) =>
              typeof b?.versionId === "string" &&
              b.versionId === boardVersionId,
          ) ?? null;
        const docId = hit && typeof hit.docId === "string" ? hit.docId : null;
        boardPreset = docId === "builtin:board-full" ? "full" : "default";
      }

      desiredConfigRef.current = { maxPlayers, boardPreset };
      const key = `${maxPlayers ?? ""}|${boardPreset ?? ""}`;
      if (key === lastSyncKeyRef.current) return;

      if (maxPlayers || boardPreset) {
        sendCommand({
          type: "room/setConfig",
          roomId: room.roomId,
          playerId: actor.playerId,
          config: {
            ...(maxPlayers ? { maxPlayers } : {}),
            ...(boardPreset ? { boardPreset } : {}),
          },
        });
        lastSyncKeyRef.current = key;
      }
    } catch (e) {
      setSyncError(String((e as Error).message || e));
    }
  }

  useEffect(() => {
    if (!room || !actor || !isHost) return;
    if (!webRoomAvailable) return;
    if (room.status !== "lobby") return;
    if (pending) return;
    void syncRoomConfigToWs();
  }, [actor, isHost, pending, room?.roomId, room?.status, webRoomAvailable]);

  useEffect(() => {
    if (!startRequested) return;
    if (!room || !actor || !isHost) return;
    if (room.status !== "lobby") {
      setStartRequested(false);
      return;
    }
    if (pending) return;
    const desired = desiredConfigRef.current;
    const bp = (room.config as { boardPreset?: unknown }).boardPreset;
    const boardPreset =
      bp === "default" || bp === "full" || bp === "e2e_fast" ? bp : null;
    if (desired?.boardPreset && boardPreset !== desired.boardPreset) {
      void syncRoomConfigToWs();
      return;
    }
    sendCommand({
      type: "room/startGame",
      roomId: room.roomId,
      playerId: actor.playerId,
    });
    setStartRequested(false);
  }, [actor, isHost, pending, room, sendCommand, startRequested]);

  const canReady =
    !!room &&
    !!selfMember &&
    !selfMember.isSpectator &&
    room.status === "lobby";
  const startDisabledReason = useMemo(() => {
    if (!room) return "房间不存在或未连接";
    if (!selfMember) return "未加入房间";
    if (!isHost) return "仅房主可开局";
    if (room.status !== "lobby") return "已开局";
    const ps = room.members.filter((m) => !m.isSpectator);
    if (ps.length < 2) return "至少需要 2 名玩家";
    const notReady = ps.filter((p) => !p.ready);
    if (notReady.length) return `仍有 ${notReady.length} 名玩家未准备`;
    return null;
  }, [isHost, room, selfMember]);

  const markedEndedGameIdRef = useRef<string | null>(null);
  useEffect(() => {
    const gid = game?.gameId ?? null;
    if (!gid) return;
    if (!roomCode || !actor || !room) return;
    if (!isHost || !isGameEnded) return;
    if (markedEndedGameIdRef.current === gid) return;
    markedEndedGameIdRef.current = gid;
    fetch("/api/room/mark-ended", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, gameId: gid }),
    }).catch(() => {});
  }, [actor, game?.gameId, isGameEnded, isHost, room, roomCode]);

  const [leaveError, setLeaveError] = useState<string | null>(null);
  async function confirmLeaveRoom() {
    if (!roomCode || leaveConfirmLoading) return;
    setLeaveConfirmLoading(true);
    setLeaveError(null);
    try {
      if (
        game?.status === "playing" &&
        actor &&
        room &&
        selfMember &&
        !selfMember.isSpectator
      ) {
        sendCommand({
          type: "game/forfeit",
          roomId: room.roomId,
          gameId: game.gameId,
          playerId: actor.playerId,
        });
      }
      const r = await fetch("/api/room/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "LEAVE_FAILED");
      clearActiveGame();
      router.push("/");
    } catch (e) {
      setLeaveError(String((e as Error).message || e));
    } finally {
      setLeaveConfirmLoading(false);
      setLeaveConfirmOpen(false);
    }
  }

  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  async function closeRoom() {
    if (!roomCode || closeLoading) return;
    setCloseLoading(true);
    setCloseError(null);
    try {
      const r = await fetch("/api/room/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "CLOSE_FAILED");
      router.push("/");
    } catch (e) {
      setCloseError(String((e as Error).message || e));
    } finally {
      setCloseLoading(false);
    }
  }

  async function joinAsAccount() {
    if (joinLoading) return;
    setJoinError(null);
    if (!uid) {
      router.push("/login");
      return;
    }
    if (!roomCode) return;
    setJoinLoading(true);
    try {
      const r = await fetch("/api/room/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, mode: "account" }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok)
        throw new Error(
          (json as { error?: string } | null)?.error || "JOIN_FAILED",
        );
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("spectate");
      const q = sp.toString();
      router.replace(
        q
          ? `/room/${encodeURIComponent(roomCode)}?${q}`
          : `/room/${encodeURIComponent(roomCode)}`,
      );
    } catch (e) {
      setJoinError(String((e as Error).message || e));
    } finally {
      setJoinLoading(false);
    }
  }

  const roomUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of room?.members ?? []) {
      const id = m.userId;
      if (!id) continue;
      set.add(id);
      const tail = id.split(":").at(-1);
      if (tail) set.add(tail);
    }
    return set;
  }, [room?.members]);
  const inviteCandidates = useMemo(
    () => friends.filter((x) => x && !roomUserIds.has(x)),
    [friends, roomUserIds],
  );
  const [inviteToUid, setInviteToUid] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState(false);
  async function sendGameInvite() {
    if (!uid || !actor || !room || !inviteToUid || inviteSending) return;
    setInviteSending(true);
    setInviteError(null);
    setInviteOk(false);
    try {
      const r = await fetch("/api/game-invite/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toUid: inviteToUid, roomCode }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok)
        throw new Error(
          (json as { error?: string } | null)?.error || "SEND_FAILED",
        );
      setInviteOk(true);
      window.setTimeout(() => setInviteOk(false), 1500);
    } catch (e) {
      setInviteError(String((e as Error).message || e));
    } finally {
      setInviteSending(false);
    }
  }

  return (
    <main
      style={{ padding: 24, maxWidth: room?.status === "playing" ? 1240 : 820 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
            }}
          >
            房间
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {roomCode || "-"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {room?.status === "lobby" &&
          !wantSpectate &&
          (!selfMember || selfMember.isSpectator) ? (
            <Button
              mode="Primary"
              onClick={joinAsAccount}
              loading={joinLoading}
              disabled={pending}
            >
              加入游戏
            </Button>
          ) : null}

          <Button
            size="sm"
            mode="Second"
            onClick={async () => {
              setRoomCodeCopied(false);
              try {
                await navigator.clipboard.writeText(roomCode);
                setRoomCodeCopied(true);
                window.setTimeout(() => setRoomCodeCopied(false), 1500);
              } catch {
                void 0;
              }
            }}
          >
            {roomCodeCopied ? "已复制" : "复制房间号"}
          </Button>

          <Tooltip content={shareCopied ? "已复制链接" : "分享/复制链接"}>
            <Button
              type="button"
              size="md"
              mode="NoBackground-Custom"
              aria-label="分享房间链接"
              iconLeft={{
                name: "symbol_link",
                mode: "default",
                thickness: "Bold",
              }}
              onClick={async () => {
                setShareCopied(false);
                try {
                  const url =
                    typeof window !== "undefined"
                      ? `${window.location.origin}/room/${encodeURIComponent(roomCode)}`
                      : "";
                  if (
                    url &&
                    typeof navigator !== "undefined" &&
                    "share" in navigator
                  ) {
                    const share = navigator.share as unknown as (data: {
                      url: string;
                    }) => Promise<void>;
                    await share({ url });
                    return;
                  }
                  if (url) await navigator.clipboard.writeText(url);
                  setShareCopied(true);
                  window.setTimeout(() => setShareCopied(false), 1500);
                } catch {
                  void 0;
                }
              }}
            ></Button>
          </Tooltip>

          {room?.status === "playing" ? (
            selfMember ? (
              <Popover
                open={spectatorsOpen}
                onOpenChange={setSpectatorsOpen}
                content={
                  spectators.length ? (
                    <ul
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: "none",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {spectators.map((p) => (
                        <li
                          key={p.playerId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              minWidth: 0,
                            }}
                          >
                            {p.userId ? (
                              <Image
                                src={`https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(p.userId)}`}
                                alt=""
                                width={22}
                                height={22}
                                style={{ borderRadius: 999 }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(0,0,0,0.06)",
                                  color: "rgba(0,0,0,0.7)",
                                  fontWeight: 800,
                                  fontSize: 12,
                                  flex: "0 0 auto",
                                }}
                              >
                                {p.displayName.trim().slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div
                              style={{
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {p.displayName}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无观战</div>
                  )
                }
              >
                <Button size="sm" mode="Second">
                  观战（{spectators.length}）
                </Button>
              </Popover>
            ) : (
              <Button
                size="sm"
                mode="Second"
                onClick={() =>
                  router.push(
                    `/room/${encodeURIComponent(roomCode)}?spectate=1`,
                  )
                }
              >
                观战
              </Button>
            )
          ) : (
            <Button
              size="sm"
              mode="Second"
              onClick={() => {
                const sp = new URLSearchParams(searchParams.toString());
                if (wantSpectate) sp.delete("spectate");
                else sp.set("spectate", "1");
                const q = sp.toString();
                router.push(
                  q
                    ? `/room/${encodeURIComponent(roomCode)}?${q}`
                    : `/room/${encodeURIComponent(roomCode)}`,
                );
              }}
            >
              {wantSpectate ? "退出观战" : "观战"}
            </Button>
          )}

          <Button
            size="sm"
            mode="Second"
            onClick={async () => {
              setDebugError(null);
              setDebugCopied(false);
              try {
                const dump = getDebugDump();
                const text = JSON.stringify(dump, null, 2);
                await navigator.clipboard.writeText(text);
                setDebugCopied(true);
                window.setTimeout(() => setDebugCopied(false), 1500);
              } catch (e) {
                setDebugError(String((e as Error).message || e));
              }
            }}
            disabled={pending}
          >
            {debugCopied ? "已复制" : "复制调试"}
          </Button>

          <Button
            size="sm"
            mode="Second"
            onClick={() => setLeaveConfirmOpen(true)}
            disabled={pending || leaveConfirmLoading}
          >
            离开
          </Button>
        </div>
      </div>

      {room?.status !== "playing" ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>房间信息</div>
          {room ? (
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.7)" }}>
              状态：{room.status} ｜房主：
              {host?.displayName ?? room.hostPlayerId} ｜玩家 {players.length}/
              {room.config.maxPlayers} ｜观战 {spectators.length} ｜连接{" "}
              {connecting ? "连接中…" : connected ? "已连接" : "未连接"}
            </div>
          ) : (
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              房间不存在或尚未加载
            </div>
          )}
        </div>
      ) : null}

      {room?.status === "lobby" && isHost ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>房间模板</div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={selectedTemplateVersionId}
              onChange={(e) => setSelectedTemplateVersionId(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                minWidth: 320,
              }}
              disabled={applyTemplateLoading || pending}
            >
              <option value="">选择模板</option>
              {publishedTemplates.map((t) => (
                <option key={t.versionId} value={t.versionId}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button
              mode="Primary"
              onClick={applyTemplate}
              disabled={
                !selectedTemplateVersionId || applyTemplateLoading || pending
              }
            >
              {applyTemplateLoading ? "应用中…" : "应用模板"}
            </Button>
          </div>
          {applyTemplateError ? (
            <div style={{ marginTop: 10, color: "#b42318" }}>
              {applyTemplateError}
            </div>
          ) : null}
          {webTemplateVersionId ? (
            <div style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
              当前模板：{currentTemplateLabel || "标准玩法"}
            </div>
          ) : null}
        </div>
      ) : null}

      {room?.status !== "playing" ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>我的状态</div>
          <div style={{ marginTop: 10, color: "rgba(0,0,0,0.7)" }}>
            {actor ? (
              <>
                {selfMember?.isSpectator ? "观战" : "玩家"}：{actor.displayName}
                {!selfMember?.isSpectator && room?.status === "lobby" ? (
                  <span> ｜{selfMember?.ready ? "已准备" : "未准备"}</span>
                ) : null}
                {isHost ? <span> ｜房主</span> : null}
              </>
            ) : wantSpectate ? (
              <>观战中…</>
            ) : (
              <>未加入</>
            )}
          </div>

          {!actor && !wantSpectate ? (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Button
                mode="Primary"
                onClick={joinAsAccount}
                loading={joinLoading}
              >
                登录并加入
              </Button>
              {joinError ? (
                <div style={{ color: "#b42318" }}>{joinError}</div>
              ) : null}
            </div>
          ) : actor ? (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Button
                onClick={() => {
                  if (!room || !selfMember) return;
                  sendCommand({
                    type: "room/setReady",
                    roomId: room.roomId,
                    playerId: actor.playerId,
                    ready: !selfMember.ready,
                  });
                }}
                disabled={!canReady || pending}
              >
                {pending ? "处理中…" : selfMember?.ready ? "取消准备" : "准备"}
              </Button>
              <Button
                onClick={() => {
                  if (!room) return;
                  setStartRequested(true);
                  void syncRoomConfigToWs();
                }}
                disabled={!!startDisabledReason || pending}
              >
                {pending
                  ? "开局中…"
                  : startDisabledReason
                    ? `开局（${startDisabledReason}）`
                    : "房主开局"}
              </Button>
              {isHost && (room?.status === "lobby" || isGameEnded) ? (
                <Button onClick={closeRoom} disabled={closeLoading}>
                  {closeLoading ? "关闭中…" : "关闭房间"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {lastError ? (
            <div style={{ marginTop: 10, color: "#b42318" }}>
              {lastError.message}
            </div>
          ) : null}
          {syncError ? (
            <div style={{ marginTop: 10, color: "#b42318" }}>{syncError}</div>
          ) : null}
          {debugError ? (
            <div style={{ marginTop: 10, color: "#b42318" }}>{debugError}</div>
          ) : null}
          {leaveError ? (
            <div style={{ marginTop: 10, color: "#b42318" }}>{leaveError}</div>
          ) : null}
          {closeError ? (
            <div style={{ marginTop: 10, color: "#b42318" }}>{closeError}</div>
          ) : null}
        </div>
      ) : null}

      {room?.status !== "playing" ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>邀请好友加入房间</div>
          {!uid ? (
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              请先登录
            </div>
          ) : !actor ? (
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              加入房间后可邀请好友
            </div>
          ) : !room || room.status === "ended" ? (
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              房间不可用
            </div>
          ) : inviteCandidates.length ? (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <select
                value={inviteToUid}
                onChange={(e) => setInviteToUid(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  minWidth: 260,
                }}
                disabled={inviteSending || pending}
              >
                <option value="">选择好友</option>
                {inviteCandidates.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <Button
                mode="Primary"
                onClick={sendGameInvite}
                disabled={!inviteToUid || inviteSending || pending}
              >
                {inviteSending ? "发送中…" : inviteOk ? "已发送" : "发送邀请"}
              </Button>
              <Button mode="Second" onClick={() => router.push("/invite")}>
                去好友页查看消息
              </Button>
              {inviteError ? (
                <div style={{ color: "#b42318" }}>{inviteError}</div>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              暂无可邀请好友（好友页先添加好友）
            </div>
          )}
        </div>
      ) : null}

      {room?.status !== "playing" ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>玩家列表</div>
          <div style={{ marginTop: 10 }}>
            {players.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {players.map((p) => (
                  <li key={p.playerId} style={{ marginTop: 6 }}>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      {(() => {
                        const uid = p.userId;
                        const pub = uid ? publicProfiles[uid] : undefined;
                        const avatarUrl = pub?.avatarUrl ?? null;
                        const initial = initialFor(p.displayName);
                        return avatarUrl ? (
                          <div
                            style={{
                              position: "relative",
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              overflow: "hidden",
                              flex: "0 0 auto",
                            }}
                          >
                            <Image
                              src={avatarUrl}
                              alt=""
                              fill
                              sizes="22px"
                              style={{ objectFit: "cover" }}
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,0,0,0.06)",
                              color: "rgba(0,0,0,0.7)",
                              fontWeight: 800,
                              fontSize: 12,
                              flex: "0 0 auto",
                            }}
                          >
                            {initial}
                          </div>
                        );
                      })()}
                      <div style={{ minWidth: 0 }}>
                        {p.displayName}
                        {p.playerId === room?.hostPlayerId ? "（房主）" : ""}｜
                        {room?.status === "lobby"
                          ? p.ready
                            ? "已准备"
                            : "未准备"
                          : "对局中"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无玩家</div>
            )}
          </div>
        </div>
      ) : null}

      {room?.status !== "playing" ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>观战列表</div>
          <div style={{ marginTop: 10 }}>
            {spectators.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {spectators.map((p) => (
                  <li key={p.playerId} style={{ marginTop: 6 }}>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      {(() => {
                        const uid = p.userId;
                        const pub = uid ? publicProfiles[uid] : undefined;
                        const avatarUrl = pub?.avatarUrl ?? null;
                        const initial = initialFor(p.displayName);
                        return avatarUrl ? (
                          <div
                            style={{
                              position: "relative",
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              overflow: "hidden",
                              flex: "0 0 auto",
                            }}
                          >
                            <Image
                              src={avatarUrl}
                              alt=""
                              fill
                              sizes="22px"
                              style={{ objectFit: "cover" }}
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,0,0,0.06)",
                              color: "rgba(0,0,0,0.7)",
                              fontWeight: 800,
                              fontSize: 12,
                              flex: "0 0 auto",
                            }}
                          >
                            {initial}
                          </div>
                        );
                      })()}
                      <div style={{ minWidth: 0 }}>{p.displayName}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无观战</div>
            )}
          </div>
        </div>
      ) : null}

      <Dialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title="离开房间"
        footer={
          <>
            <Button
              mode="Second"
              onClick={() => setLeaveConfirmOpen(false)}
              disabled={leaveConfirmLoading}
            >
              取消
            </Button>
            <Button
              mode="Primary"
              onClick={confirmLeaveRoom}
              loading={leaveConfirmLoading}
            >
              确认离开
            </Button>
          </>
        }
      >
        <div style={{ color: "rgba(0,0,0,0.7)", lineHeight: "22px" }}>
          {room?.status === "playing"
            ? "确定退出房间吗？退出后你的资产将会归属银行。"
            : "确定退出房间吗？退出后需要重新加入房间才能继续游玩。"}
        </div>
      </Dialog>

      {room?.status === "playing" && game && actor && snapshot ? (
        <BoardSkeleton
          snapshot={snapshot}
          selfPlayerId={actor.playerId}
          sendCommand={sendCommand}
          pending={pending}
          lastError={lastError}
          lastCardDrawn={lastCardDrawn}
          clearLastCard={clearLastCard}
          chatMessages={chatMessages}
          recentEvents50={recentEvents50}
        />
      ) : null}
    </main>
  );
}
