export type ConfigKind = 'rules' | 'board' | 'cards';

export type ConfigStatus = 'draft' | 'published' | 'archived';

export type ConfigIssue = { path: string; message: string };
export type ConfigValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ConfigIssue[] };

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
  createdAtMs: number;
  updatedAtMs: number;
  publishedVersionId: string | null;
  draftVersionId: string;
  versionIds: string[];
  versions: Record<string, ConfigVersion>;
};

export type RulesConfig = {
  initialCash: number;
  startSalary: number;
  jailFine: number;
  mortgageInterestRate: number;
  bankHouses: number;
  bankHotels: number;
};

export type BoardTileTemplate =
  | { kind: 'start' }
  | {
      kind: 'property';
      propertyId: string;
      groupId: string;
      price: number;
      houseCost: number;
      rents: [number, number, number, number, number, number];
    }
  | { kind: 'jail' }
  | { kind: 'goToJail' }
  | { kind: 'tax'; amount: number }
  | { kind: 'chance' }
  | { kind: 'communityChest' };

export type BoardConfigTemplate = {
  tiles: BoardTileTemplate[];
  jailIndex: number;
};

export type CardDeckKind = 'chance' | 'communityChest';

export type CardEffect =
  | { kind: 'money'; delta: number }
  | { kind: 'moneyFromEachPlayer'; amount: number }
  | { kind: 'moveTo'; index: number; passStart: boolean }
  | { kind: 'goToJail' }
  | { kind: 'getOutOfJail' };

export type CardDefTemplate = {
  cardId: string;
  deck: CardDeckKind;
  text: string;
  effect: CardEffect;
};

export type CardsConfig = {
  cards: CardDefTemplate[];
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isString(input: unknown): input is string {
  return typeof input === 'string';
}

function isBoolean(input: unknown): input is boolean {
  return typeof input === 'boolean';
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function clampNumber(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function issue(path: string, message: string): ConfigIssue {
  return { path, message };
}

export function validateRulesConfig(input: unknown): ConfigValidationResult<RulesConfig> {
  if (!isRecord(input)) return { ok: false, issues: [issue('', '规则配置必须为对象')] };
  const issues: ConfigIssue[] = [];
  const raw = input as Record<string, unknown>;

  const initialCash = clampInt(Number(raw.initialCash), 100, 50_000);
  if (!Number.isFinite(Number(raw.initialCash)) || initialCash !== Math.trunc(Number(raw.initialCash)))
    issues.push(issue('initialCash', 'initialCash 必须为整数'));

  const startSalary = clampInt(Number(raw.startSalary), 0, 50_000);
  if (!Number.isFinite(Number(raw.startSalary)) || startSalary !== Math.trunc(Number(raw.startSalary)))
    issues.push(issue('startSalary', 'startSalary 必须为整数'));

  const jailFine = clampInt(Number(raw.jailFine), 0, 50_000);
  if (!Number.isFinite(Number(raw.jailFine)) || jailFine !== Math.trunc(Number(raw.jailFine)))
    issues.push(issue('jailFine', 'jailFine 必须为整数'));

  const mortgageInterestRate = clampNumber(Number(raw.mortgageInterestRate), 0, 1);
  if (!Number.isFinite(Number(raw.mortgageInterestRate))) issues.push(issue('mortgageInterestRate', 'mortgageInterestRate 必须为数字'));
  if (mortgageInterestRate < 0 || mortgageInterestRate > 1) issues.push(issue('mortgageInterestRate', 'mortgageInterestRate 范围为 0-1'));

  const bankHouses = clampInt(Number(raw.bankHouses), 0, 200);
  if (!Number.isFinite(Number(raw.bankHouses)) || bankHouses !== Math.trunc(Number(raw.bankHouses)))
    issues.push(issue('bankHouses', 'bankHouses 必须为整数'));

  const bankHotels = clampInt(Number(raw.bankHotels), 0, 200);
  if (!Number.isFinite(Number(raw.bankHotels)) || bankHotels !== Math.trunc(Number(raw.bankHotels)))
    issues.push(issue('bankHotels', 'bankHotels 必须为整数'));

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: { initialCash, startSalary, jailFine, mortgageInterestRate, bankHouses, bankHotels },
  };
}

function validateTile(input: unknown, index: number): ConfigValidationResult<BoardTileTemplate> {
  if (!isRecord(input)) return { ok: false, issues: [issue(`tiles.${index}`, 'tile 必须为对象')] };
  const raw = input as Record<string, unknown>;
  const kind = raw.kind;
  if (!isString(kind)) return { ok: false, issues: [issue(`tiles.${index}.kind`, 'kind 必须为字符串')] };

  const issues: ConfigIssue[] = [];
  const base = `tiles.${index}`;

  const requireString = (key: string) => {
    const v = raw[key];
    if (!isString(v) || v.trim().length === 0) issues.push(issue(`${base}.${key}`, `${key} 必须为非空字符串`));
    return String(v ?? '');
  };

  const requireInt = (key: string, min: number, max: number) => {
    const v = Number(raw[key]);
    if (!Number.isFinite(v) || Math.trunc(v) !== v) issues.push(issue(`${base}.${key}`, `${key} 必须为整数`));
    const c = clampInt(v, min, max);
    if (c < min || c > max) issues.push(issue(`${base}.${key}`, `${key} 范围为 ${min}-${max}`));
    return c;
  };

  if (kind === 'start') return { ok: true, value: { kind: 'start' } };
  if (kind === 'jail') return { ok: true, value: { kind: 'jail' } };
  if (kind === 'goToJail') return { ok: true, value: { kind: 'goToJail' } };
  if (kind === 'chance') return { ok: true, value: { kind: 'chance' } };
  if (kind === 'communityChest') return { ok: true, value: { kind: 'communityChest' } };

  if (kind === 'tax') {
    const amount = requireInt('amount', 0, 50_000);
    if (issues.length) return { ok: false, issues };
    return { ok: true, value: { kind: 'tax', amount } };
  }

  if (kind === 'property') {
    const propertyId = requireString('propertyId');
    const groupId = requireString('groupId');
    const price = requireInt('price', 0, 50_000);
    const houseCost = requireInt('houseCost', 0, 50_000);

    const rentsRaw = raw.rents;
    const rentsBase = `${base}.rents`;
    if (!Array.isArray(rentsRaw) || rentsRaw.length !== 6) {
      issues.push(issue(rentsBase, 'rents 必须为长度为 6 的数组'));
    }
    const rentsParsed = (Array.isArray(rentsRaw) ? rentsRaw : []).map((x, i) => {
      const n = Number(x);
      if (!Number.isFinite(n) || Math.trunc(n) !== n) issues.push(issue(`${rentsBase}.${i}`, '租金必须为整数'));
      if (n < 0 || n > 50_000) issues.push(issue(`${rentsBase}.${i}`, '租金范围为 0-50000'));
      return clampInt(n, 0, 50_000);
    });

    if (issues.length) return { ok: false, issues };
    const rents = rentsParsed.slice(0, 6) as [number, number, number, number, number, number];
    return { ok: true, value: { kind: 'property', propertyId, groupId, price, houseCost, rents } };
  }

  return { ok: false, issues: [issue(`${base}.kind`, `未知 kind: ${kind}`)] };
}

export function validateBoardConfig(input: unknown): ConfigValidationResult<BoardConfigTemplate> {
  if (!isRecord(input)) return { ok: false, issues: [issue('', '棋盘配置必须为对象')] };
  const raw = input as Record<string, unknown>;
  const issues: ConfigIssue[] = [];

  const tilesRaw = raw.tiles;
  if (!Array.isArray(tilesRaw) || tilesRaw.length === 0) issues.push(issue('tiles', 'tiles 必须为非空数组'));

  const tilesParsed: BoardTileTemplate[] = [];
  if (Array.isArray(tilesRaw)) {
    for (let i = 0; i < tilesRaw.length; i += 1) {
      const r = validateTile(tilesRaw[i], i);
      if (!r.ok) issues.push(...r.issues);
      else tilesParsed.push(r.value);
    }
  }

  const jailIndex = clampInt(Number(raw.jailIndex), 0, Math.max(0, tilesParsed.length - 1));
  if (!Number.isFinite(Number(raw.jailIndex)) || jailIndex !== Math.trunc(Number(raw.jailIndex)))
    issues.push(issue('jailIndex', 'jailIndex 必须为整数'));
  if (tilesParsed.length > 0 && (jailIndex < 0 || jailIndex >= tilesParsed.length))
    issues.push(issue('jailIndex', 'jailIndex 超出 tiles 范围'));

  const propertyIds = new Set<string>();
  tilesParsed.forEach((t, idx) => {
    if (t.kind !== 'property') return;
    const pid = t.propertyId;
    if (propertyIds.has(pid)) issues.push(issue(`tiles.${idx}.propertyId`, 'propertyId 重复'));
    propertyIds.add(pid);
  });

  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { tiles: tilesParsed, jailIndex } };
}

function validateCardEffect(effect: unknown, base: string, issues: ConfigIssue[]): CardEffect | null {
  if (!isRecord(effect)) {
    issues.push(issue(base, 'effect 必须为对象'));
    return null;
  }
  const kind = effect.kind;
  if (!isString(kind)) {
    issues.push(issue(`${base}.kind`, 'effect.kind 必须为字符串'));
    return null;
  }

  if (kind === 'money') {
    const delta = Number(effect.delta);
    if (!Number.isFinite(delta) || Math.trunc(delta) !== delta) issues.push(issue(`${base}.delta`, 'delta 必须为整数'));
    return { kind: 'money', delta: clampInt(delta, -50_000, 50_000) };
  }

  if (kind === 'moneyFromEachPlayer') {
    const amount = Number(effect.amount);
    if (!Number.isFinite(amount) || Math.trunc(amount) !== amount) issues.push(issue(`${base}.amount`, 'amount 必须为整数'));
    return { kind: 'moneyFromEachPlayer', amount: clampInt(amount, 0, 50_000) };
  }

  if (kind === 'moveTo') {
    const index = Number(effect.index);
    if (!Number.isFinite(index) || Math.trunc(index) !== index) issues.push(issue(`${base}.index`, 'index 必须为整数'));
    const passStart = effect.passStart;
    if (!isBoolean(passStart)) issues.push(issue(`${base}.passStart`, 'passStart 必须为 boolean'));
    return { kind: 'moveTo', index: clampInt(index, 0, 10_000), passStart: isBoolean(passStart) ? passStart : false };
  }

  if (kind === 'goToJail') return { kind: 'goToJail' };
  if (kind === 'getOutOfJail') return { kind: 'getOutOfJail' };

  issues.push(issue(`${base}.kind`, `未知 effect.kind: ${kind}`));
  return null;
}

export function validateCardsConfig(input: unknown): ConfigValidationResult<CardsConfig> {
  if (!isRecord(input)) return { ok: false, issues: [issue('', '卡牌配置必须为对象')] };
  const raw = input as Record<string, unknown>;
  const issues: ConfigIssue[] = [];

  const cardsRaw = raw.cards;
  if (!Array.isArray(cardsRaw)) issues.push(issue('cards', 'cards 必须为数组'));

  const parsed: CardDefTemplate[] = [];
  if (Array.isArray(cardsRaw)) {
    for (let i = 0; i < cardsRaw.length; i += 1) {
      const base = `cards.${i}`;
      const c = cardsRaw[i];
      if (!isRecord(c)) {
        issues.push(issue(base, 'card 必须为对象'));
        continue;
      }
      const cardId = c.cardId;
      if (!isString(cardId) || cardId.trim().length === 0) issues.push(issue(`${base}.cardId`, 'cardId 必须为非空字符串'));
      const deck = c.deck;
      if (deck !== 'chance' && deck !== 'communityChest') issues.push(issue(`${base}.deck`, 'deck 必须为 chance 或 communityChest'));
      const text = c.text;
      if (!isString(text) || text.trim().length === 0) issues.push(issue(`${base}.text`, 'text 必须为非空字符串'));
      const eff = validateCardEffect(c.effect, `${base}.effect`, issues);
      if (!eff) continue;
      if (isString(cardId) && (deck === 'chance' || deck === 'communityChest') && isString(text)) {
        parsed.push({ cardId, deck, text, effect: eff });
      }
    }
  }

  const ids = new Set<string>();
  parsed.forEach((c, idx) => {
    if (ids.has(c.cardId)) issues.push(issue(`cards.${idx}.cardId`, 'cardId 重复'));
    ids.add(c.cardId);
  });

  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { cards: parsed } };
}

export function defaultRulesConfig(): RulesConfig {
  return { initialCash: 1500, startSalary: 200, jailFine: 50, mortgageInterestRate: 0.1, bankHouses: 32, bankHotels: 12 };
}

export function defaultBoardConfig(): BoardConfigTemplate {
  return {
    jailIndex: 6,
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'p1', groupId: 'g1', price: 60, houseCost: 50, rents: [2, 10, 30, 90, 160, 250] },
      { kind: 'chance' },
      { kind: 'property', propertyId: 'p2', groupId: 'g1', price: 60, houseCost: 50, rents: [4, 20, 60, 180, 320, 450] },
      { kind: 'tax', amount: 200 },
      { kind: 'property', propertyId: 'p3', groupId: 'g2', price: 100, houseCost: 50, rents: [6, 30, 90, 270, 400, 550] },
      { kind: 'jail' },
      { kind: 'communityChest' },
      { kind: 'property', propertyId: 'p4', groupId: 'g2', price: 120, houseCost: 50, rents: [8, 40, 100, 300, 450, 600] },
      { kind: 'goToJail' },
      { kind: 'property', propertyId: 'p5', groupId: 'g3', price: 140, houseCost: 100, rents: [10, 50, 150, 450, 625, 750] },
    ],
  };
}

export function fullBoardConfig(): BoardConfigTemplate {
  const p = (input: {
    propertyId: string;
    groupId: string;
    price: number;
    houseCost: number;
    rents: [number, number, number, number, number, number];
  }): BoardTileTemplate => ({
    kind: 'property',
    propertyId: input.propertyId,
    groupId: input.groupId,
    price: input.price,
    houseCost: input.houseCost,
    rents: input.rents,
  });
  return {
    jailIndex: 10,
    tiles: [
      { kind: 'start' },
      p({ propertyId: 'f_p01', groupId: 'f_g_brown', price: 60, houseCost: 50, rents: [2, 10, 30, 90, 160, 250] }),
      { kind: 'communityChest' },
      p({ propertyId: 'f_p02', groupId: 'f_g_brown', price: 60, houseCost: 50, rents: [4, 20, 60, 180, 320, 450] }),
      { kind: 'tax', amount: 200 },
      p({ propertyId: 'f_p03', groupId: 'f_g_rail', price: 200, houseCost: 100, rents: [25, 50, 100, 200, 350, 500] }),
      p({ propertyId: 'f_p04', groupId: 'f_g_lightblue', price: 100, houseCost: 50, rents: [6, 30, 90, 270, 400, 550] }),
      { kind: 'chance' },
      p({ propertyId: 'f_p05', groupId: 'f_g_lightblue', price: 100, houseCost: 50, rents: [6, 30, 90, 270, 400, 550] }),
      p({ propertyId: 'f_p06', groupId: 'f_g_lightblue', price: 120, houseCost: 50, rents: [8, 40, 100, 300, 450, 600] }),
      { kind: 'jail' },
      p({ propertyId: 'f_p07', groupId: 'f_g_pink', price: 140, houseCost: 100, rents: [10, 50, 150, 450, 625, 750] }),
      p({ propertyId: 'f_p08', groupId: 'f_g_util', price: 150, houseCost: 100, rents: [10, 20, 30, 40, 50, 60] }),
      p({ propertyId: 'f_p09', groupId: 'f_g_pink', price: 160, houseCost: 100, rents: [12, 60, 180, 500, 700, 900] }),
      p({ propertyId: 'f_p10', groupId: 'f_g_pink', price: 180, houseCost: 100, rents: [14, 70, 200, 550, 750, 950] }),
      p({ propertyId: 'f_p11', groupId: 'f_g_rail', price: 200, houseCost: 100, rents: [25, 50, 100, 200, 350, 500] }),
      p({ propertyId: 'f_p12', groupId: 'f_g_orange', price: 180, houseCost: 100, rents: [14, 70, 200, 550, 750, 950] }),
      { kind: 'communityChest' },
      p({ propertyId: 'f_p13', groupId: 'f_g_orange', price: 200, houseCost: 100, rents: [16, 80, 220, 600, 800, 1000] }),
      p({ propertyId: 'f_p14', groupId: 'f_g_orange', price: 220, houseCost: 150, rents: [18, 90, 250, 700, 875, 1050] }),
      { kind: 'chance' },
      p({ propertyId: 'f_p15', groupId: 'f_g_red', price: 220, houseCost: 150, rents: [18, 90, 250, 700, 875, 1050] }),
      { kind: 'chance' },
      p({ propertyId: 'f_p16', groupId: 'f_g_red', price: 240, houseCost: 150, rents: [20, 100, 300, 750, 925, 1100] }),
      p({ propertyId: 'f_p17', groupId: 'f_g_red', price: 260, houseCost: 150, rents: [22, 110, 330, 800, 975, 1150] }),
      p({ propertyId: 'f_p18', groupId: 'f_g_rail', price: 200, houseCost: 100, rents: [25, 50, 100, 200, 350, 500] }),
      p({ propertyId: 'f_p19', groupId: 'f_g_yellow', price: 260, houseCost: 150, rents: [22, 110, 330, 800, 975, 1150] }),
      p({ propertyId: 'f_p20', groupId: 'f_g_yellow', price: 280, houseCost: 150, rents: [24, 120, 360, 850, 1025, 1200] }),
      p({ propertyId: 'f_p21', groupId: 'f_g_util', price: 150, houseCost: 100, rents: [10, 20, 30, 40, 50, 60] }),
      p({ propertyId: 'f_p22', groupId: 'f_g_yellow', price: 300, houseCost: 200, rents: [26, 130, 390, 900, 1100, 1275] }),
      { kind: 'goToJail' },
      p({ propertyId: 'f_p23', groupId: 'f_g_green', price: 300, houseCost: 200, rents: [26, 130, 390, 900, 1100, 1275] }),
      p({ propertyId: 'f_p24', groupId: 'f_g_green', price: 320, houseCost: 200, rents: [28, 150, 450, 1000, 1200, 1400] }),
      { kind: 'communityChest' },
      p({ propertyId: 'f_p25', groupId: 'f_g_green', price: 350, houseCost: 200, rents: [35, 175, 500, 1100, 1300, 1500] }),
      p({ propertyId: 'f_p26', groupId: 'f_g_rail', price: 200, houseCost: 100, rents: [25, 50, 100, 200, 350, 500] }),
      { kind: 'chance' },
      p({ propertyId: 'f_p27', groupId: 'f_g_darkblue', price: 350, houseCost: 200, rents: [35, 175, 500, 1100, 1300, 1500] }),
      { kind: 'tax', amount: 100 },
      p({ propertyId: 'f_p28', groupId: 'f_g_darkblue', price: 400, houseCost: 200, rents: [50, 200, 600, 1400, 1700, 2000] }),
    ],
  };
}

export function defaultCardsConfig(): CardsConfig {
  return {
    cards: [
      { cardId: 'c1', deck: 'chance', text: '前往起点，领取工资', effect: { kind: 'moveTo', index: 0, passStart: true } },
      { cardId: 'c2', deck: 'chance', text: '入狱', effect: { kind: 'goToJail' } },
      { cardId: 'cc1', deck: 'communityChest', text: '银行分红 +200', effect: { kind: 'money', delta: 200 } },
      { cardId: 'cc2', deck: 'communityChest', text: '出狱卡', effect: { kind: 'getOutOfJail' } },
    ],
  };
}

export function createDoc(input: { docId: string; kind: ConfigKind; name: string; nowMs: number; draftData: unknown }): ConfigDoc {
  const versionId = `v${input.nowMs}`;
  const v: ConfigVersion = { versionId, status: 'draft', createdAtMs: input.nowMs, updatedAtMs: input.nowMs, data: input.draftData };
  return {
    docId: input.docId,
    kind: input.kind,
    name: input.name,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    publishedVersionId: null,
    draftVersionId: versionId,
    versionIds: [versionId],
    versions: { [versionId]: v },
  };
}
