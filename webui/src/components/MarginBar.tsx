import type { ReactNode } from "react";
import type { Category } from "@/lib/native";
import { isNum } from "@/lib/fmt";

/**
 * このアプリの中心にある図。
 *
 * 帯1本を「金1オンスの売値」と見なし、採掘コスト(AISC)が左から埋める。
 * 埋まらずに残った部分がそのまま利益＝マージンになる。
 * 数字を読まなくても、コストが売値をどれだけ食っているかが分かる。
 *
 * 描画は必ず左端から右へ伸ばす。内側の2区画（コストとマージン）は
 * 外側の1枚をまとめて左から広げることで、境目が右から生えたように
 * 見えるのを防いでいる。
 *
 * ロイヤリティ会社は採掘しないので同じ図が成立しない。
 * 意図的に別の描き方にして、業態が違うことを図の形で示す。
 */
export function MarginBar({
  gold, aisc, category, compact = false,
}: {
  gold?: number;
  aisc?: number | null;
  category: Category;
  compact?: boolean;
}) {
  const h = compact ? "h-2" : "h-3";

  if (category === "royalty") {
    // 契約で固定された取得価格は売値のごく一部。細い刻みで示す。
    return (
      <div className="space-y-1">
        <Track h={h}>
          <Seg from={0} to={14} color="var(--copper)" />
          <Seg from={14} to={100} color="var(--bullion)" />
        </Track>
        {!compact && (
          <div className="flex justify-between text-[11px]">
            <span className="text-copper">固定の取得価格</span>
            <span className="text-bullion">採掘コストの変動を受けない</span>
          </div>
        )}
      </div>
    );
  }

  if (!isNum(gold) || !isNum(aisc) || gold <= 0) {
    return (
      <div className="space-y-1">
        <div className={`relative ${h} overflow-hidden rounded-full bg-vein`}>
          <div className="pulse absolute inset-0 bg-line" />
        </div>
        {!compact && <p className="text-[11px] text-ore">AISC未取得。AI更新で埋まります</p>}
      </div>
    );
  }

  const costRatio = Math.min(100, Math.max(0, (aisc / gold) * 100));
  const marginRatio = 100 - costRatio;
  const thin = marginRatio < 22;

  return (
    <div className="space-y-1">
      <Track h={h}>
        <Seg from={0} to={costRatio} color="rgb(var(--ore-rgb) / .55)" />
        <Seg from={costRatio} to={100} color={thin ? "var(--slag)" : "var(--bullion)"} />
      </Track>
      {!compact && (
        <div className="flex justify-between text-[11px]">
          <span className="text-ore">
            コスト <span className="fig">${Math.round(aisc).toLocaleString()}</span>
          </span>
          <span className={thin ? "text-slag" : "text-bullion"}>
            マージン <span className="fig">{marginRatio.toFixed(0)}%</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** 帯の外枠。中身をまとめて左端から右へ広げる。 */
function Track({ h, children }: { h: string; children: ReactNode }) {
  return (
    <div className={`relative ${h} overflow-hidden rounded-full bg-vein`}>
      <div className="fill absolute inset-0">{children}</div>
    </div>
  );
}

/** 帯の一区画。左端からの位置を % で指定する。 */
function Seg({ from, to, color }: { from: number; to: number; color: string }) {
  return (
    <div
      className="absolute inset-y-0"
      style={{ left: `${from}%`, width: `${Math.max(0, to - from)}%`, background: color }}
    />
  );
}
