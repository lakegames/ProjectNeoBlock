import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Profile = {
  id: string;
  displayName: string;
  githubAvatarUrl?: string | null;
  customAvatarDataUrl?: string | null;
  customAvatarMime?: "image/png" | "image/jpeg" | "image/webp" | null;
  avatarUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoomStatus = "lobby" | "playing" | "ended";

export type RoomConfig = {
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  templateVersionId?: string;
  rulesetVersionId?: string;
  boardVersionId?: string;
  cardsVersionId?: string;
};

export type RoomMember = {
  playerId: string;
  userId?: string;
  displayName: string;
  isSpectator: boolean;
  ready: boolean;
  joinedAtMs: number;
};

export type Room = {
  code: string;
  roomId: string;
  status: RoomStatus;
  hostPlayerId: string;
  createdAtMs: number;
  config: RoomConfig;
  members: RoomMember[];
  startedAtMs?: number;
  endedAtMs?: number;
  emptySinceMs?: number;
  closedAtMs?: number;
};

export type GameInviteMessage = {
  id: string;
  toUid: string;
  fromUid: string;
  roomCode: string;
  createdAtMs: number;
  readAtMs?: number;
  dismissedAtMs?: number;
};

export type ConfigKind = "rules" | "board" | "cards" | "template";
export type ConfigStatus = "draft" | "published" | "archived";
export type TemplateVisibility = "private" | "public";

export type ConfigVersion = {
  versionId: string;
  status: ConfigStatus;
  createdAtMs: number;
  updatedAtMs: number;
  data: unknown;
  baseVersionId?: string;
  note?: string;
};

export type ConfigDoc = {
  docId: string;
  kind: ConfigKind;
  name: string;
  ownerId?: string | null;
  visibility?: TemplateVisibility;
  createdAtMs: number;
  updatedAtMs: number;
  publishedVersionId: string | null;
  draftVersionId: string;
  versionIds: string[];
  versions: Record<string, ConfigVersion>;
};

export type AppData = {
  profiles: Record<string, Profile>;
  friends: Record<string, string[]>;
  rooms: Record<string, Room>;
  configDocs: Record<string, ConfigDoc>;
  gameInvites: GameInviteMessage[];
};

const defaultData: AppData = {
  profiles: {},
  friends: {},
  rooms: {},
  configDocs: {},
  gameInvites: [],
};

function dataFilePath() {
  const base = process.env.NEOBLOCK_DATA_DIR || process.cwd();
  return path.join(base, ".data", "neoblock.json");
}

async function ensureDataDir() {
  await mkdir(path.dirname(dataFilePath()), { recursive: true });
}

export type AppDataStore = {
  read: () => Promise<AppData>;
  update: <T>(fn: (data: AppData) => T | Promise<T>) => Promise<T>;
};

export function defaultRulesConfig() {
  return {
    initialCash: 1500,
    startSalary: 200,
    jailFine: 50,
    mortgageInterestRate: 0.1,
    bankHouses: 32,
    bankHotels: 12,
  };
}

export function defaultBoardConfig() {
  return {
    jailIndex: 6,
    tiles: [
      { kind: "start" },
      {
        kind: "property",
        propertyId: "p1",
        groupId: "g1",
        price: 60,
        houseCost: 50,
        rents: [2, 10, 30, 90, 160, 250],
      },
      { kind: "chance" },
      {
        kind: "property",
        propertyId: "p2",
        groupId: "g1",
        price: 60,
        houseCost: 50,
        rents: [4, 20, 60, 180, 320, 450],
      },
      { kind: "tax", amount: 200 },
      {
        kind: "property",
        propertyId: "p3",
        groupId: "g2",
        price: 100,
        houseCost: 50,
        rents: [6, 30, 90, 270, 400, 550],
      },
      { kind: "jail" },
      { kind: "communityChest" },
      {
        kind: "property",
        propertyId: "p4",
        groupId: "g2",
        price: 120,
        houseCost: 50,
        rents: [8, 40, 100, 300, 450, 600],
      },
      { kind: "goToJail" },
      {
        kind: "property",
        propertyId: "p5",
        groupId: "g3",
        price: 140,
        houseCost: 100,
        rents: [10, 50, 150, 450, 625, 750],
      },
    ],
  };
}

export function fullBoardConfig() {
  const groupNameById = (groupId: string) => {
    if (groupId === "f_g_brown") return "棕色组";
    if (groupId === "f_g_lightblue") return "浅蓝组";
    if (groupId === "f_g_pink") return "粉色组";
    if (groupId === "f_g_orange") return "橙色组";
    if (groupId === "f_g_red") return "红色组";
    if (groupId === "f_g_yellow") return "黄色组";
    if (groupId === "f_g_green") return "绿色组";
    if (groupId === "f_g_darkblue") return "深蓝组";
    if (groupId === "f_g_rail") return "铁路组";
    if (groupId === "f_g_util") return "公用事业组";
    return groupId;
  };
  const p = (input: {
    propertyId: string;
    name: string;
    groupId: string;
    price: number;
    houseCost: number;
    rents: [number, number, number, number, number, number];
  }) => ({
    kind: "property" as const,
    propertyId: input.propertyId,
    name: input.name,
    groupId: input.groupId,
    groupName: groupNameById(input.groupId),
    price: input.price,
    houseCost: input.houseCost,
    rents: input.rents,
  });
  return {
    jailIndex: 10,
    tiles: [
      { kind: "start" },
      p({
        propertyId: "f_p01",
        name: "旧金山",
        groupId: "f_g_brown",
        price: 60,
        houseCost: 50,
        rents: [2, 10, 30, 90, 160, 250],
      }),
      { kind: "communityChest" },
      p({
        propertyId: "f_p02",
        name: "洛杉矶",
        groupId: "f_g_brown",
        price: 60,
        houseCost: 50,
        rents: [4, 20, 60, 180, 320, 450],
      }),
      { kind: "tax", amount: 200 },
      p({
        propertyId: "f_p03",
        name: "纽约",
        groupId: "f_g_rail",
        price: 200,
        houseCost: 100,
        rents: [25, 50, 100, 200, 350, 500],
      }),
      p({
        propertyId: "f_p04",
        name: "多伦多",
        groupId: "f_g_lightblue",
        price: 100,
        houseCost: 50,
        rents: [6, 30, 90, 270, 400, 550],
      }),
      { kind: "chance" },
      p({
        propertyId: "f_p05",
        name: "温哥华",
        groupId: "f_g_lightblue",
        price: 100,
        houseCost: 50,
        rents: [6, 30, 90, 270, 400, 550],
      }),
      p({
        propertyId: "f_p06",
        name: "西雅图",
        groupId: "f_g_lightblue",
        price: 120,
        houseCost: 50,
        rents: [8, 40, 100, 300, 450, 600],
      }),
      { kind: "jail" },
      p({
        propertyId: "f_p07",
        name: "墨西哥城",
        groupId: "f_g_pink",
        price: 140,
        houseCost: 100,
        rents: [10, 50, 150, 450, 625, 750],
      }),
      p({
        propertyId: "f_p08",
        name: "里约热内卢",
        groupId: "f_g_util",
        price: 150,
        houseCost: 100,
        rents: [10, 20, 30, 40, 50, 60],
      }),
      p({
        propertyId: "f_p09",
        name: "布宜诺斯艾利斯",
        groupId: "f_g_pink",
        price: 160,
        houseCost: 100,
        rents: [12, 60, 180, 500, 700, 900],
      }),
      p({
        propertyId: "f_p10",
        name: "伦敦",
        groupId: "f_g_pink",
        price: 180,
        houseCost: 100,
        rents: [14, 70, 200, 550, 750, 950],
      }),
      p({
        propertyId: "f_p11",
        name: "巴黎",
        groupId: "f_g_rail",
        price: 200,
        houseCost: 100,
        rents: [25, 50, 100, 200, 350, 500],
      }),
      p({
        propertyId: "f_p12",
        name: "阿姆斯特丹",
        groupId: "f_g_orange",
        price: 180,
        houseCost: 100,
        rents: [14, 70, 200, 550, 750, 950],
      }),
      { kind: "communityChest" },
      p({
        propertyId: "f_p13",
        name: "柏林",
        groupId: "f_g_orange",
        price: 200,
        houseCost: 100,
        rents: [16, 80, 220, 600, 800, 1000],
      }),
      p({
        propertyId: "f_p14",
        name: "罗马",
        groupId: "f_g_orange",
        price: 220,
        houseCost: 150,
        rents: [18, 90, 250, 700, 875, 1050],
      }),
      { kind: "chance" },
      p({
        propertyId: "f_p15",
        name: "马德里",
        groupId: "f_g_red",
        price: 220,
        houseCost: 150,
        rents: [18, 90, 250, 700, 875, 1050],
      }),
      { kind: "chance" },
      p({
        propertyId: "f_p16",
        name: "里斯本",
        groupId: "f_g_red",
        price: 240,
        houseCost: 150,
        rents: [20, 100, 300, 750, 925, 1100],
      }),
      p({
        propertyId: "f_p17",
        name: "苏黎世",
        groupId: "f_g_red",
        price: 260,
        houseCost: 150,
        rents: [22, 110, 330, 800, 975, 1150],
      }),
      p({
        propertyId: "f_p18",
        name: "斯德哥尔摩",
        groupId: "f_g_rail",
        price: 200,
        houseCost: 100,
        rents: [25, 50, 100, 200, 350, 500],
      }),
      p({
        propertyId: "f_p19",
        name: "赫尔辛基",
        groupId: "f_g_yellow",
        price: 260,
        houseCost: 150,
        rents: [22, 110, 330, 800, 975, 1150],
      }),
      p({
        propertyId: "f_p20",
        name: "莫斯科",
        groupId: "f_g_yellow",
        price: 280,
        houseCost: 150,
        rents: [24, 120, 360, 850, 1025, 1200],
      }),
      p({
        propertyId: "f_p21",
        name: "伊斯坦布尔",
        groupId: "f_g_util",
        price: 150,
        houseCost: 100,
        rents: [10, 20, 30, 40, 50, 60],
      }),
      p({
        propertyId: "f_p22",
        name: "迪拜",
        groupId: "f_g_yellow",
        price: 300,
        houseCost: 200,
        rents: [26, 130, 390, 900, 1100, 1275],
      }),
      { kind: "goToJail" },
      p({
        propertyId: "f_p23",
        name: "开罗",
        groupId: "f_g_green",
        price: 300,
        houseCost: 200,
        rents: [26, 130, 390, 900, 1100, 1275],
      }),
      p({
        propertyId: "f_p24",
        name: "内罗毕",
        groupId: "f_g_green",
        price: 320,
        houseCost: 200,
        rents: [28, 150, 450, 1000, 1200, 1400],
      }),
      { kind: "communityChest" },
      p({
        propertyId: "f_p25",
        name: "约翰内斯堡",
        groupId: "f_g_green",
        price: 350,
        houseCost: 200,
        rents: [35, 175, 500, 1100, 1300, 1500],
      }),
      p({
        propertyId: "f_p26",
        name: "新德里",
        groupId: "f_g_rail",
        price: 200,
        houseCost: 100,
        rents: [25, 50, 100, 200, 350, 500],
      }),
      { kind: "chance" },
      p({
        propertyId: "f_p27",
        name: "北京",
        groupId: "f_g_darkblue",
        price: 350,
        houseCost: 200,
        rents: [35, 175, 500, 1100, 1300, 1500],
      }),
      { kind: "tax", amount: 100 },
      p({
        propertyId: "f_p28",
        name: "东京",
        groupId: "f_g_darkblue",
        price: 400,
        houseCost: 200,
        rents: [50, 200, 600, 1400, 1700, 2000],
      }),
    ],
  };
}

export function defaultCardsConfig() {
  return {
    cards: [
      {
        cardId: "c1",
        deck: "chance",
        text: "前往起点，领取工资",
        effect: { kind: "moveTo", index: 0, passStart: true },
      },
      {
        cardId: "c2",
        deck: "chance",
        text: "入狱",
        effect: { kind: "goToJail" },
      },
      {
        cardId: "cc1",
        deck: "communityChest",
        text: "银行分红 +200",
        effect: { kind: "money", delta: 200 },
      },
      {
        cardId: "cc2",
        deck: "communityChest",
        text: "出狱卡",
        effect: { kind: "getOutOfJail" },
      },
    ],
  };
}

export function createDoc(input: {
  docId: string;
  kind: ConfigKind;
  name: string;
  ownerId?: string | null;
  visibility?: TemplateVisibility;
  nowMs: number;
  draftData: unknown;
}): ConfigDoc {
  const versionId = `v${input.nowMs}`;
  const v: ConfigVersion = {
    versionId,
    status: "draft",
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    data: input.draftData,
  };
  return {
    docId: input.docId,
    kind: input.kind,
    name: input.name,
    ...(typeof input.ownerId !== "undefined" ? { ownerId: input.ownerId } : {}),
    ...(typeof input.visibility !== "undefined"
      ? { visibility: input.visibility }
      : {}),
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    publishedVersionId: null,
    draftVersionId: versionId,
    versionIds: [versionId],
    versions: { [versionId]: v },
  };
}

function allocVersionId(nowMs: number) {
  return `v${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
}

export function publishDoc(doc: ConfigDoc, nowMs: number, note?: string) {
  const draft = doc.versions[doc.draftVersionId];
  if (!draft) return null;

  if (doc.publishedVersionId && doc.versions[doc.publishedVersionId]) {
    doc.versions[doc.publishedVersionId]!.status = "archived";
    doc.versions[doc.publishedVersionId]!.updatedAtMs = nowMs;
  }

  const versionId = allocVersionId(nowMs);
  const v: ConfigVersion = {
    versionId,
    status: "published",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    data: draft.data,
    ...(draft.versionId ? { baseVersionId: draft.versionId } : {}),
    ...(note ? { note } : {}),
  };
  doc.versions[versionId] = v;
  doc.versionIds.push(versionId);
  doc.publishedVersionId = versionId;
  doc.updatedAtMs = nowMs;
  return versionId;
}

export function listDocs(data: AppData, kind?: ConfigKind) {
  return Object.values(data.configDocs)
    .filter((d) => (kind ? d.kind === kind : true))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function effectiveTemplateVisibility(
  doc: ConfigDoc,
): TemplateVisibility {
  return doc.visibility === "private" || doc.visibility === "public"
    ? doc.visibility
    : "public";
}

export function resolvePublishedVersionId(
  data: AppData,
  kind: ConfigKind,
  preferred?: string | undefined,
): string | null {
  const candidates = listDocs(data, kind).filter((d) => d.publishedVersionId);
  if (preferred) {
    const hit = candidates.find((d) => d.publishedVersionId === preferred);
    if (hit?.publishedVersionId) return hit.publishedVersionId;
  }
  return candidates[0]?.publishedVersionId ?? null;
}

export function ensureSeedConfigs(data: AppData, nowMs: number) {
  const hasPublished = (kind: ConfigKind) =>
    Object.values(data.configDocs).some(
      (d) => d.kind === kind && d.publishedVersionId,
    );

  const ensureOne = (kind: ConfigKind, name: string, draftData: unknown) => {
    if (hasPublished(kind)) return;
    const docId = `builtin:${kind}`;
    if (!data.configDocs[docId])
      data.configDocs[docId] = createDoc({
        docId,
        kind,
        name,
        nowMs,
        draftData,
      });
    if (!data.configDocs[docId]!.publishedVersionId)
      publishDoc(data.configDocs[docId]!, nowMs, "seed");
  };

  ensureOne("rules", "默认规则", defaultRulesConfig());
  ensureOne("board", "默认棋盘", defaultBoardConfig());
  ensureOne("cards", "默认卡牌", defaultCardsConfig());

  {
    const docId = "builtin:board-full";
    const existing = data.configDocs[docId];
    if (!existing)
      data.configDocs[docId] = createDoc({
        docId,
        kind: "board",
        name: "标准 40 格（测试）",
        nowMs,
        draftData: fullBoardConfig(),
      });
    if (!data.configDocs[docId]!.publishedVersionId)
      publishDoc(data.configDocs[docId]!, nowMs, "seed");
  }

  {
    const systemDefaultTemplateDocId = "system:template-standard";
    const legacyDefaultTemplateDocId = "builtin:template-standard";
    const legacy = data.configDocs[legacyDefaultTemplateDocId];
    if (legacy?.publishedVersionId) return;

    const docId = systemDefaultTemplateDocId;
    const existing = data.configDocs[docId];
    if (!existing) {
      const rulesVersionId = resolvePublishedVersionId(data, "rules") ?? "";
      const boardVersionId =
        Object.values(data.configDocs).find(
          (d) => d.kind === "board" && d.docId === "builtin:board-full",
        )?.publishedVersionId ??
        resolvePublishedVersionId(data, "board") ??
        "";
      const cardsVersionId = resolvePublishedVersionId(data, "cards") ?? "";
      data.configDocs[docId] = createDoc({
        docId,
        kind: "template",
        name: "标准玩法（系统）",
        nowMs,
        draftData: { rulesVersionId, boardVersionId, cardsVersionId },
      });
    }
    if (!data.configDocs[docId]!.publishedVersionId)
      publishDoc(data.configDocs[docId]!, nowMs, "seed");
  }
}

export function createAppDataStore(): AppDataStore {
  let cache: AppData | null = null;
  let loadPromise: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const load = async () => {
    if (cache) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      await ensureDataDir();
      try {
        const raw = await readFile(dataFilePath(), "utf8");
        const parsed = JSON.parse(raw) as Partial<AppData>;
        cache = {
          profiles: parsed.profiles ?? {},
          friends: parsed.friends ?? {},
          rooms: parsed.rooms ?? {},
          configDocs:
            typeof (parsed as { configDocs?: unknown }).configDocs ===
              "object" &&
            (parsed as { configDocs?: unknown }).configDocs !== null
              ? ((parsed as { configDocs: Record<string, ConfigDoc> })
                  .configDocs as Record<string, ConfigDoc>)
              : {},
          gameInvites: parsed.gameInvites ?? [],
        };
      } catch {
        cache = structuredClone(defaultData);
      }
    })();
    await loadPromise;
    loadPromise = null;
  };

  const flush = async () => {
    await ensureDataDir();
    await writeFile(
      dataFilePath(),
      JSON.stringify(cache ?? defaultData, null, 2),
      "utf8",
    );
  };

  return {
    read: async () => {
      await load();
      return structuredClone(cache ?? defaultData);
    },
    update: async <T>(fn: (data: AppData) => T | Promise<T>) => {
      await load();
      const run = queue.then(async () => {
        const data = cache ?? (structuredClone(defaultData) as AppData);
        const result = await fn(data);
        cache = data;
        await flush();
        return result;
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run as Promise<T>;
    },
  };
}
