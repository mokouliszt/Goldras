// ネイティブ(MainActivity.Bridge)との橋渡し。
// JS → Native.*  /  Native → window.__native(type, payload)

export type Category = "senior" | "mid" | "royalty";

export interface TickerDef {
  ticker: string;
  name: string;
  nameEn?: string;
  category: Category;
  oilSensitivity: number;
  jurisdictionRisk: number;
  jurisdictions?: string[];
  keyAssets?: string[];
  traits?: string[];
  ir?: string;
}

export interface Universe {
  version?: number;
  categories: Record<Category, { label: string; desc: string }>;
  tickers: TickerDef[];
  benchmarks: { symbol: string; label: string; key: string }[];
}

export interface Quote {
  last: number;
  chg1d: number; chg1w: number; chg1m: number; chg3m: number; chg6m: number; chg12m: number;
  ma50: number; ma200: number; distMa200: number;
  rsi14: number; hi52: number; lo52: number;
  drawdown: number; pctRange52: number; vol30: number;
  relGdx3m?: number; relGdx12m?: number;
  spark?: number[];
}

export interface Snapshot {
  at: number;
  quotes: Record<string, Quote>;
  series: Record<string, number[]>;
  bench: Record<string, Quote & { spark?: number[] }>;
}

export interface Warning { severity: "high" | "medium"; what: string; why: string }
export interface Catalyst { when: string; what: string; impact: "up" | "down" | "either" }

export interface Fundamental {
  at?: number;
  asOf?: string;
  aisc?: number | null;
  aiscPrior?: number | null;
  aiscGuidance?: string | null;
  guidanceTrend?: "improving" | "stable" | "worsening" | null;
  production?: number | null;
  productionUnit?: string | null;
  pnav?: number | null;
  pnav5yAvg?: number | null;
  evEbitda?: number | null;
  fcfYield?: number | null;
  netDebtEbitda?: number | null;
  dividendYield?: number | null;
  hedged?: boolean | null;
  reserveLifeYears?: number | null;
  costDrivers?: string[];
  catalysts?: Catalyst[];
  warnings?: Warning[];
  thesis?: string;
  sources?: string[];
}

export interface MacroData {
  at?: number;
  asOf?: string;
  centralBank?: { recentTonnes?: number | null; trend?: string | null; note?: string };
  etfFlow?: { recentTonnes?: number | null; trend?: string | null; note?: string };
  positioning?: { netLongPercentile?: number | null; extreme?: boolean | null; note?: string };
  centralBankScore?: number;
  etfFlowScore?: number;
  positioningScore?: number;
  supply?: { note?: string };
  themes?: { title: string; detail: string; direction: "up" | "down" }[];
  summary?: string;
  sources?: string[];
}

export type Verdict = "accumulate" | "starter" | "wait" | "trim";

export interface Score {
  score: number;
  verdict: Verdict;
  parts: { value: number; margin: number; macro: number; flow: number };
  weights: { value: number; margin: number; macro: number; flow: number };
  marginPct: number | null;
  missing: string[];
  capped: boolean;
}

export interface Scores {
  tickers: Record<string, Score>;
  gold: {
    score: number;
    parts: {
      realRate: number; dxy: number; momentum: number;
      centralBank: number; etfFlow: number; positioning: number;
    };
  };
}

export interface Scenario { case: "bull" | "base" | "bear"; probability: number; target: number; trigger: string }

export interface Prediction {
  id: string;
  ticker: string;
  horizon: "3m" | "12m";
  createdAt: number;
  dueAt: number;
  basePrice: number;
  direction: "up" | "flat" | "down";
  low: number | null;
  high: number | null;
  confidence: number;
  scenarios: Scenario[];
  rationale?: string;
  watchFor?: string[];
  drivers?: { factor: string; direction: "up" | "down"; weight: string }[];
  sources?: string[];
  result?: {
    actual: number;
    actualDirection: string;
    directionHit: boolean;
    inRange: boolean;
    gradedAt: number;
  };
}

export interface BulkOptions {
  force?: boolean;
  macro?: boolean;
  fundamentals?: boolean;
  forecast?: boolean;
}

export interface BulkPlan {
  all: string[];
  stale: string[];
  macroStale: boolean;
  days: number;
}

export interface Settings {
  /** 空 = Codex のデフォルト。Codex の更新に追従する */
  model: string;
  /** 空 = そのモデルのデフォルト */
  effort: string;
  codexAutoUpdate: "wifi" | "always" | "off";
  horizon: "3m" | "12m";
  alerts: boolean;
  moveThreshold: number;
  autoRefresh: boolean;
  autoAnalyze: boolean;
  autoAnalyzeDays: number;
}

/** Codex が提示しているモデル（model/list）。アプリ側に一覧は持たない。 */
export interface CodexModel {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultEffort: string;
  efforts: string[];
}

export interface CodexAccount { email?: string | null; planType?: string | null }

export interface CodexUpdateStatus {
  /** 実行に使う版 */
  active: string;
  /** APK に同梱した版 */
  bundled: string;
  latest: string;
  checkedAt: number;
}

export interface CodexDownload { version: string; done: number; total: number }

export interface AppState {
  loggedIn: boolean;
  /** 画面が離れている間も走り続けているリクエストのID（あれば） */
  activeRequest?: string | null;
  progress?: { reqId: string; label: string; done: number; total: number } | null;
  codex: { bundled: boolean; update: CodexUpdateStatus; updating: CodexDownload | null };
  settings: Settings;
  universe: Universe;
  snapshot: Snapshot;
  fundamentals: Record<string, Fundamental>;
  macro: MacroData;
  predictions: Prediction[];
  scores: Scores;
}

interface Bridge {
  state(): string;
  login(reqId: string, device: boolean): void;
  cancelLogin(): void;
  logout(): void;
  codexModels(reqId: string): void;
  codexCheckUpdate(reqId: string): void;
  codexUpdate(reqId: string): void;
  refresh(reqId: string): void;
  research(reqId: string, ticker: string): void;
  researchMacro(reqId: string): void;
  forecast(reqId: string, ticker: string): void;
  autoAnalyze(reqId: string): void;
  bulk(reqId: string, options: string): void;
  bulkPlan(): string;
  chat(reqId: string, payload: string): void;
  cancel(reqId: string): void;
  scores(): string;
  predictions(): string;
  deletePrediction(id: string): string;
  addTicker(json: string): string;
  removeTicker(ticker: string): string;
  saveSettings(json: string): void;
  openUrl(url: string): void;
  copy(text: string): void;
  share(text: string): void;
  haptic(): void;
}

declare global {
  interface Window {
    Native?: Bridge;
    __native?: (type: string, payload: any) => void;
  }
}

const N = () => window.Native;
export const isNative = () => !!window.Native;

type Handler = (payload: any) => void;
const handlers = new Map<string, Set<Handler>>();

window.__native = (type, payload) => {
  handlers.get(type)?.forEach((h) => {
    try { h(payload); } catch (e) { console.error(type, e); }
  });
};

export function on(type: string, h: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(h);
  return () => handlers.get(type)?.delete(h);
}

let seq = 0;
export const newReqId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

function parse<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    const o = JSON.parse(text);
    if (o && typeof o === "object" && "error" in o && !Array.isArray(o)) {
      console.error("bridge error:", o.error);
      return fallback;
    }
    return o as T;
  } catch { return fallback; }
}

export const emptyState: AppState = {
  loggedIn: false,
  activeRequest: null,
  progress: null,
  codex: { bundled: true, update: { active: "", bundled: "", latest: "", checkedAt: 0 }, updating: null },
  settings: {
    model: "", effort: "", codexAutoUpdate: "wifi", horizon: "12m", alerts: true,
    moveThreshold: 7, autoRefresh: true, autoAnalyze: false, autoAnalyzeDays: 7,
  },
  universe: { categories: {} as any, tickers: [], benchmarks: [] },
  snapshot: { at: 0, quotes: {}, series: {}, bench: {} },
  fundamentals: {},
  macro: {},
  predictions: [],
  scores: { tickers: {}, gold: { score: 50, parts: {} as any } },
};

export const api = {
  state: (): AppState => parse(N()?.state(), emptyState),
  /** ログイン方法を選ぶシートを開く。AIを使う操作の各所から呼ばれる。 */
  login: () => window.__native?.("openLogin", {}),
  startLogin: (reqId: string, device: boolean) => N()?.login(reqId, device),
  cancelLogin: () => N()?.cancelLogin(),
  logout: () => N()?.logout(),
  codexModels: (reqId: string) => N()?.codexModels(reqId),
  codexCheckUpdate: (reqId: string) => N()?.codexCheckUpdate(reqId),
  codexUpdate: (reqId: string) => N()?.codexUpdate(reqId),
  refresh: (reqId: string) => N()?.refresh(reqId),
  research: (reqId: string, t: string) => N()?.research(reqId, t),
  researchMacro: (reqId: string) => N()?.researchMacro(reqId),
  autoAnalyze: (reqId: string) => N()?.autoAnalyze(reqId),
  bulk: (reqId: string, o: BulkOptions) => N()?.bulk(reqId, JSON.stringify(o)),
  bulkPlan: (): BulkPlan =>
    parse(N()?.bulkPlan(), { all: [], stale: [], macroStale: false, days: 7 }),
  forecast: (reqId: string, t: string) => N()?.forecast(reqId, t),
  chat: (reqId: string, messages: { role: string; content: string }[]) =>
    N()?.chat(reqId, JSON.stringify({ messages })),
  cancel: (reqId: string) => N()?.cancel(reqId),
  scores: (): Scores => parse(N()?.scores(), emptyState.scores),
  predictions: (): Prediction[] => parse(N()?.predictions(), []),
  deletePrediction: (id: string): Prediction[] => parse(N()?.deletePrediction(id), []),
  addTicker: (d: Partial<TickerDef>): Universe => parse(N()?.addTicker(JSON.stringify(d)), emptyState.universe),
  removeTicker: (t: string): Universe => parse(N()?.removeTicker(t), emptyState.universe),
  saveSettings: (s: Partial<Settings>) => N()?.saveSettings(JSON.stringify(s)),
  openUrl: (u: string) => N()?.openUrl(u),
  copy: (t: string) => N()?.copy(t),
  share: (t: string) => N()?.share(t),
  haptic: () => N()?.haptic(),
};

const EFFORT_LABELS: Record<string, string> = {
  none: "なし",
  minimal: "最小",
  low: "低",
  medium: "中",
  high: "高",
};

/**
 * 思考の深さの表示名。一般的な段階だけ訳し、xhigh・max・ultra のような
 * Codex 固有の段階（後から増えるものを含む）は Codex での呼び名のまま出す。
 */
export const effortLabel = (e: string) => EFFORT_LABELS[e] ?? e;
