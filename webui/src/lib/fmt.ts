import type { Category, Verdict } from "./native";

export const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function pct(v: unknown, digits = 1): string {
  if (!isNum(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function num(v: unknown, digits = 2): string {
  if (!isNum(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function usd(v: unknown, digits = 2): string {
  if (!isNum(v)) return "—";
  return `$${num(v, digits)}`;
}

export const tone = (v: unknown): "good" | "bad" | undefined =>
  !isNum(v) ? undefined : v > 0 ? "good" : v < 0 ? "bad" : undefined;

export const signColor = (v: unknown): string =>
  !isNum(v) ? "text-ore" : v > 0 ? "text-assay" : v < 0 ? "text-slag" : "text-ore";

/** 分類ごとの色。左端の縦棒と分類バッジで共有する。 */
export const catColor: Record<Category, string> = {
  senior: "var(--bullion)",
  mid: "var(--cinder)",
  royalty: "var(--copper)",
};

export const catLabel: Record<Category, string> = {
  senior: "大手",
  mid: "中堅",
  royalty: "ロイヤリティ",
};

export const verdictLabel: Record<Verdict, string> = {
  accumulate: "積極的に買う",
  starter: "打診買い",
  wait: "待つ",
  trim: "利確検討",
};

export const verdictColor: Record<Verdict, string> = {
  accumulate: "var(--assay)",
  starter: "var(--bullion)",
  wait: "var(--ore)",
  slag: "var(--slag)",
  trim: "var(--slag)",
} as any;

export function scoreColor(s: number): string {
  if (s >= 70) return "var(--assay)";
  if (s >= 55) return "var(--bullion)";
  if (s >= 40) return "var(--ore)";
  return "var(--slag)";
}

export function ago(ms: number | undefined): string {
  if (!ms) return "未取得";
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export function dateJp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
