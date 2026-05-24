"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Button, Input } from "@neoblock/ui";

type DocListItem = {
  docId: string;
  kind: "rules" | "board" | "cards" | "template";
  name: string;
  visibility?: "private" | "public";
  createdAtMs: number;
  updatedAtMs: number;
  publishedVersionId: string | null;
  draftVersionId: string;
};

type PublishedConfigItem = {
  docId: string;
  name: string;
  versionId: string;
  updatedAtMs: number;
};

export default function ConfigHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"template" | "config">(() =>
    searchParams.get("tab") === "config" ? "config" : "template",
  );

  const [publishedRules, setPublishedRules] = useState<PublishedConfigItem[]>(
    [],
  );
  const [publishedBoards, setPublishedBoards] = useState<PublishedConfigItem[]>(
    [],
  );
  const [publishedCards, setPublishedCards] = useState<PublishedConfigItem[]>(
    [],
  );

  const [createKind, setCreateKind] = useState<"rules" | "board" | "cards">(
    "rules",
  );
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [createTemplateName, setCreateTemplateName] = useState("");
  const [createTemplateRulesVersionId, setCreateTemplateRulesVersionId] =
    useState("");
  const [createTemplateBoardVersionId, setCreateTemplateBoardVersionId] =
    useState("");
  const [createTemplateCardsVersionId, setCreateTemplateCardsVersionId] =
    useState("");
  const [createTemplateLoading, setCreateTemplateLoading] = useState(false);
  const [createTemplateError, setCreateTemplateError] = useState<string | null>(
    null,
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/config/list", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "LOAD_FAILED");
      setDocs((json.docs ?? []) as DocListItem[]);
    } catch (e) {
      setError(String((e as Error).message || e));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<"rules" | "board" | "cards" | "template", DocListItem[]> = {
      rules: [],
      board: [],
      cards: [],
      template: [],
    };
    for (const d of docs) g[d.kind].push(d);
    return g;
  }, [docs]);

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

  useEffect(() => {
    if (!createTemplateRulesVersionId)
      setCreateTemplateRulesVersionId(publishedRules[0]?.versionId ?? "");
  }, [createTemplateRulesVersionId, publishedRules]);
  useEffect(() => {
    if (createTemplateBoardVersionId) return;
    const full =
      publishedBoards.find((b) => b.docId === "builtin:board-full")
        ?.versionId ?? "";
    setCreateTemplateBoardVersionId(
      full || publishedBoards[0]?.versionId || "",
    );
  }, [createTemplateBoardVersionId, publishedBoards]);
  useEffect(() => {
    if (!createTemplateCardsVersionId)
      setCreateTemplateCardsVersionId(publishedCards[0]?.versionId ?? "");
  }, [createTemplateCardsVersionId, publishedCards]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const next = tab === "config" ? "config" : "template";
    setActiveTab(next);
  }, [searchParams]);

  async function createDoc() {
    if (createLoading) return;
    const name = createName.trim();
    if (!name) {
      setCreateError("名称不能为空");
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const r = await fetch("/api/config/doc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: createKind, name }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "CREATE_FAILED");
      setCreateName("");
      await refresh();
    } catch (e) {
      setCreateError(String((e as Error).message || e));
    } finally {
      setCreateLoading(false);
    }
  }

  async function createTemplate() {
    if (createTemplateLoading) return;
    if (!uid) {
      setCreateTemplateError("请先登录后创建模板");
      return;
    }
    const name = createTemplateName.trim();
    if (!name) {
      setCreateTemplateError("名称不能为空");
      return;
    }
    if (
      !createTemplateRulesVersionId ||
      !createTemplateBoardVersionId ||
      !createTemplateCardsVersionId
    ) {
      setCreateTemplateError("请先选择规则/棋盘/卡牌的已发布版本");
      return;
    }
    setCreateTemplateLoading(true);
    setCreateTemplateError(null);
    try {
      const r = await fetch("/api/config/doc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "template", name }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "CREATE_FAILED");
      const docId = String(json?.doc?.docId ?? "");
      if (!docId) throw new Error("DOC_ID_MISSING");
      const r2 = await fetch("/api/config/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId,
          draftData: {
            rulesVersionId: createTemplateRulesVersionId,
            boardVersionId: createTemplateBoardVersionId,
            cardsVersionId: createTemplateCardsVersionId,
          },
        }),
      });
      const json2 = await r2.json();
      if (!r2.ok) throw new Error(json2?.error || "SAVE_DRAFT_FAILED");
      setCreateTemplateName("");
      router.push(`/config/${encodeURIComponent(docId)}`);
    } catch (e) {
      setCreateTemplateError(String((e as Error).message || e));
    } finally {
      setCreateTemplateLoading(false);
    }
  }

  function setTab(next: "template" | "config") {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    const q = sp.toString();
    router.replace(q ? `/config?${q}` : "/config");
  }

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: 0 }}>游戏自定义</h1>
      <p style={{ marginTop: 8, color: "rgba(0,0,0,0.65)" }}>
        创建模板（规则+棋盘+卡牌 的组合），以及管理规则 / 棋盘 / 卡牌 配置
      </p>

      <div
        style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <Button
          mode={activeTab === "template" ? "Primary" : "Second"}
          onClick={() => setTab("template")}
        >
          模板
        </Button>
        <Button
          mode={activeTab === "config" ? "Primary" : "Second"}
          onClick={() => setTab("config")}
        >
          配置
        </Button>
        <Button onClick={refresh} disabled={loading}>
          {loading ? "刷新中…" : "刷新列表"}
        </Button>
      </div>

      {activeTab === "template" ? (
        <>
          <section
            style={{
              marginTop: 20,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>新建模板</div>
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
                value={createTemplateName}
                onChange={(e) => setCreateTemplateName(e.target.value)}
                placeholder="模板名称，例如：标准玩法（快节奏）"
                style={{ minWidth: 280 }}
              />
              <select
                value={createTemplateRulesVersionId}
                onChange={(e) =>
                  setCreateTemplateRulesVersionId(e.target.value)
                }
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  minWidth: 260,
                }}
              >
                <option value="">规则（已发布版本）</option>
                {publishedRules.map((x) => (
                  <option key={x.versionId} value={x.versionId}>
                    {x.name}（{x.versionId}）
                  </option>
                ))}
              </select>
              <select
                value={createTemplateBoardVersionId}
                onChange={(e) =>
                  setCreateTemplateBoardVersionId(e.target.value)
                }
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  minWidth: 260,
                }}
              >
                <option value="">棋盘（已发布版本）</option>
                {publishedBoards.map((x) => (
                  <option key={x.versionId} value={x.versionId}>
                    {x.name}（{x.versionId}）
                  </option>
                ))}
              </select>
              <select
                value={createTemplateCardsVersionId}
                onChange={(e) =>
                  setCreateTemplateCardsVersionId(e.target.value)
                }
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  minWidth: 260,
                }}
              >
                <option value="">卡牌（已发布版本）</option>
                {publishedCards.map((x) => (
                  <option key={x.versionId} value={x.versionId}>
                    {x.name}（{x.versionId}）
                  </option>
                ))}
              </select>
              <Button
                onClick={createTemplate}
                disabled={createTemplateLoading || !uid}
              >
                {createTemplateLoading ? "创建中…" : "创建"}
              </Button>
            </div>
            {!uid ? (
              <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
                登录后才可创建“默认仅自己可见”的模板
              </div>
            ) : null}
            {createTemplateError ? (
              <div style={{ marginTop: 10, color: "#b42318" }}>
                {createTemplateError}
              </div>
            ) : null}
          </section>

          <section
            style={{
              marginTop: 20,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>模板</div>
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              模板是规则/棋盘/卡牌已发布版本的组合，可用于创建房间和房间参数
            </div>
            <div style={{ marginTop: 10 }}>
              {grouped.template.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {grouped.template.map((d) => (
                    <li key={d.docId} style={{ marginTop: 8 }}>
                      <span style={{ fontWeight: 700 }}>{d.name}</span>（
                      {d.docId}）
                      {d.visibility ? (
                        <span
                          style={{
                            marginLeft: 8,
                            color:
                              d.visibility === "public"
                                ? "#027a48"
                                : "rgba(0,0,0,0.65)",
                            fontWeight: 700,
                          }}
                        >
                          {d.visibility === "public" ? "公开" : "私有"}
                        </span>
                      ) : null}
                      <span
                        style={{ marginLeft: 8, color: "rgba(0,0,0,0.65)" }}
                      >
                        ｜发布{" "}
                        {d.publishedVersionId ? d.publishedVersionId : "-"}{" "}
                        ｜草稿 {d.draftVersionId}
                      </span>
                      <Button
                        style={{ marginLeft: 10 }}
                        onClick={() =>
                          router.push(`/config/${encodeURIComponent(d.docId)}`)
                        }
                      >
                        进入
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无</div>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section
            style={{
              marginTop: 20,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>新建配置文档</div>
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
                value={createKind}
                onChange={(e) =>
                  setCreateKind(e.target.value as "rules" | "board" | "cards")
                }
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  minWidth: 160,
                }}
              >
                <option value="rules">规则</option>
                <option value="board">棋盘</option>
                <option value="cards">卡牌</option>
              </select>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="名称，例如：标准规则 v2"
                style={{ minWidth: 280 }}
              />
              <Button onClick={createDoc} disabled={createLoading}>
                {createLoading ? "创建中…" : "创建"}
              </Button>
            </div>
            {createError ? (
              <div style={{ marginTop: 10, color: "#b42318" }}>
                {createError}
              </div>
            ) : null}
          </section>

          <section
            style={{
              marginTop: 20,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>配置文档</div>
            <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)" }}>
              点击进入后编辑草稿，发布后可用于模板与创建房间
            </div>

            {(["rules", "board", "cards"] as const).map((k) => {
              const list = grouped[k];
              const title =
                k === "rules" ? "规则" : k === "board" ? "棋盘" : "卡牌";
              return (
                <div key={k} style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 8 }}>
                    {list.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {list.map((d) => (
                          <li key={d.docId} style={{ marginTop: 8 }}>
                            <span style={{ fontWeight: 700 }}>{d.name}</span>（
                            {d.docId}）
                            <span
                              style={{
                                marginLeft: 8,
                                color: "rgba(0,0,0,0.65)",
                              }}
                            >
                              ｜发布{" "}
                              {d.publishedVersionId
                                ? d.publishedVersionId
                                : "-"}{" "}
                              ｜草稿 {d.draftVersionId}
                            </span>
                            <Button
                              style={{ marginLeft: 10 }}
                              onClick={() =>
                                router.push(
                                  `/config/${encodeURIComponent(d.docId)}`,
                                )
                              }
                            >
                              进入
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "rgba(0,0,0,0.65)" }}>暂无</div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      {error ? (
        <div style={{ marginTop: 12, color: "#b42318" }}>{error}</div>
      ) : null}
    </main>
  );
}
