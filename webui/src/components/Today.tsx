import { useState } from "react";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import type { AppState } from "@/lib/native";
import { Badge, Button, Card, Segmented } from "./ui";
import { ScoreDial, Spark } from "./Charts";
import { MarginBar } from "./MarginBar";
import { ago, catColor, catLabel, isNum, pct, scoreColor, signColor, usd, verdictLabel } from "@/lib/fmt";

const PERIODS = [
  { id: "1w" as const, label: "1週", field: "chg1w" as const, days: 5 },
  { id: "1m" as const, label: "1ヶ月", field: "chg1m" as const, days: 21 },
  { id: "3m" as const, label: "3ヶ月", field: "chg3m" as const, days: 63 },
  { id: "12m" as const, label: "1年", field: "chg12m" as const, days: 252 },
];

type PeriodId = (typeof PERIODS)[number]["id"];

export function Today({
  state, busy, onRefresh, onOpen, onGoSignal, onBulk,
}: {
  state: AppState;
  busy: boolean;
  onRefresh: () => void;
  onOpen: (t: string) => void;
  onGoSignal: () => void;
  onBulk: () => void;
}) {
  const [period, setPeriod] = useState<PeriodId>("1w");
  const [moversOpen, setMoversOpen] = useState(false);

  const { snapshot, scores, universe, fundamentals } = state;
  const gold = snapshot.bench?.gold;
  const regime = scores.gold;
  const stale = !snapshot.at;

  const ranked = universe.tickers
    .map((d) => ({ def: d, s: scores.tickers?.[d.ticker], q: snapshot.quotes?.[d.ticker] }))
    .filter((x) => x.s && x.q)
    .sort((a, b) => b.s.score - a.s.score);

  // 危険信号は銘柄名とセットでないと意味がないので、ここで束ねる。
  const flags = universe.tickers.flatMap((d) =>
    (fundamentals?.[d.ticker]?.warnings ?? [])
      .filter((w) => w.severity === "high")
      .map((w) => ({ ticker: d.ticker, ...w })),
  );

  // 基礎情報がまだ入っていない銘柄の数
  const missing = universe.tickers.filter((d) => !fundamentals?.[d.ticker]?.at).length;

  const periodDef = PERIODS.find((p) => p.id === period) ?? PERIODS[0];
  const movers = ranked
    .filter((x) => isNum(x.q[periodDef.field] as number))
    // 上げた順に並べる。全件表示したときにそのまま順位表として読める
    .sort((a, b) => (b.q[periodDef.field] as number) - (a.q[periodDef.field] as number))
    .slice(0, moversOpen ? undefined : 3);

  return (
    <div className="space-y-3.5 px-4 pb-6">
      {/* 金そのものの地合い。個別銘柄より先に、まずここを見る画面。 */}
      <Card className="rise overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <ScoreDial
            score={regime?.score ?? 50}
            size={124}
            label={regimeLabel(regime?.score ?? 50)}
            sub="金の地合い"
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div>
              <span className="eyebrow">金 スポット</span>
              <div className="flex items-baseline gap-2">
                <span className="fig text-[22px] font-semibold text-bullion">
                  {isNum(gold?.last) ? `$${Math.round(gold!.last).toLocaleString()}` : "—"}
                </span>
                <span className={`fig text-[12px] ${signColor(gold?.chg1m)}`}>{pct(gold?.chg1m)}</span>
              </div>
            </div>
            <Spark data={gold?.spark} width={148} height={34} color="var(--bullion)" />
            <div className="flex flex-wrap gap-1">
              {isNum(snapshot.bench?.realRate?.last) && (
                <Badge tone={snapshot.bench.realRate.last < 1.5 ? "gold" : "neutral"}>
                  実質金利 {snapshot.bench.realRate.last.toFixed(2)}%
                </Badge>
              )}
              {isNum(snapshot.bench?.dxy?.chg3m) && (
                <Badge tone={snapshot.bench.dxy.chg3m < 0 ? "gold" : "neutral"}>
                  ドル {pct(snapshot.bench.dxy.chg3m, 0)}
                </Badge>
              )}
              {isNum(snapshot.bench?.oil?.chg3m) && (
                <Badge tone="neutral">原油 {pct(snapshot.bench.oil.chg3m, 0)}</Badge>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-[11.5px] text-ore active:bg-vein disabled:opacity-50"
        >
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          {stale ? "市場データを取得" : `更新 ${ago(snapshot.at)}`}
        </button>
      </Card>

      {stale && (
        <Card className="border-bullion/30 p-4">
          <p className="text-[13px] leading-relaxed">
            まず市場データを取得してください。株価・金・原油・ドル指数・実質金利を取り込み、
            買い場スコアを計算します。
          </p>
          <Button className="mt-3 w-full" onClick={onRefresh} disabled={busy}>
            取得する
          </Button>
        </Card>
      )}

      {/* 判断に効く危険信号だけを、目立つ位置に出す。 */}
      {flags.length > 0 && (
        <Card className="rise border-slag/35 bg-slag/[0.06] p-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-slag" />
            <span className="disp text-[13px] text-slag">確認が必要な変化</span>
          </div>
          <div className="space-y-2">
            {flags.slice(0, 3).map((f, i) => (
              <button key={i} onClick={() => onOpen(f.ticker)} className="block w-full text-left">
                <span className="disp text-[12px] text-ink">{f.ticker}</span>
                <span className="ml-1.5 text-[12.5px] text-ink">{f.what}</span>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ore">{f.why}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 買い場の上位。1年保有なので順位より「どの帯にいるか」を見せる。 */}
      {ranked.length > 0 && (
        <Card className="rise overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <span className="eyebrow">買い場スコア 上位</span>
            <button onClick={onGoSignal} className="text-[11.5px] text-bullion">すべて</button>
          </div>
          <div className="divide-y divide-line/60">
            {ranked.slice(0, 4).map(({ def, s, q }) => (
              <button
                key={def.ticker}
                onClick={() => onOpen(def.ticker)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-vein"
              >
                <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: catColor[def.category] }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="disp text-[15px]">{def.ticker}</span>
                    <span className="truncate text-[11px] text-ore">{catLabel[def.category]}</span>
                  </div>
                  <div className="mt-1">
                    <MarginBar
                      gold={gold?.last}
                      aisc={fundamentals?.[def.ticker]?.aisc}
                      category={def.category}
                      compact
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="fig text-[17px] font-semibold" style={{ color: scoreColor(s.score) }}>
                    {Math.round(s.score)}
                  </div>
                  <div className="text-[10px]" style={{ color: scoreColor(s.score) }}>
                    {verdictLabel[s.verdict]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 今週動いたもの。1年保有では「なぜ動いたか」を確認する入口にすぎない。 */}
      {movers.length > 0 && (
        <Card className="rise p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">値動き</span>
            <button
              onClick={() => setMoversOpen((v) => !v)}
              className="text-[11.5px] text-bullion"
            >
              {moversOpen ? "上位だけ" : `すべて (${ranked.length})`}
            </button>
          </div>

          {/* 1年保有が前提なので、週足だけでなく期間を切り替えられるようにする */}
          <Segmented
            className="mt-2"
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
          />

          <div className="mt-2.5 space-y-2">
            {movers.map(({ def, q }) => {
              const chg = q[periodDef.field] as number;
              return (
                <button
                  key={def.ticker}
                  onClick={() => onOpen(def.ticker)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span
                    className="h-5 w-[2px] shrink-0 rounded-full"
                    style={{ background: catColor[def.category] }}
                  />
                  <span className="disp w-[38px] text-[14px]">{def.ticker}</span>
                  <Spark
                    // 変化率は「N営業日前の終値」を基準にするので、
                    // 線もその日を含むよう1本多く切り出す
                    data={snapshot.series?.[def.ticker]?.slice(-(periodDef.days + 1))}
                    trend={chg}
                    width={64}
                    height={22}
                  />
                  <span className="flex-1 text-right">
                    <span className="fig text-[13px] text-ink">{usd(q.last)}</span>
                    <span className={`fig ml-2 text-[12px] ${signColor(chg)}`}>{pct(chg)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {!state.loggedIn && !stale && (
        <Card className="rise border-bullion/25 p-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles size={13} className="text-bullion" />
            <span className="disp text-[13px]">AI分析は未接続</span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ore">
            価格から計算できる部分は表示できています。採掘コスト・ガイダンス・現地の動向は、
            ChatGPTにログインすると取り込めます。
          </p>
        </Card>
      )}

      {/* 基礎情報が欠けている銘柄があるうちは、まとめて埋める導線を出しておく。
          1銘柄ずつ開いて押して回るのは現実的でない。 */}
      {state.loggedIn && !stale && missing > 0 && (
        <Card className="rise border-bullion/25 p-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles size={13} className="text-bullion" />
            <span className="disp text-[13px]">未取得の基礎情報が {missing} 件</span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ore">
            採掘コストとマージンが入ると、買い場スコアの割安度とマージンの評価が実データに切り替わります。
          </p>
          <Button className="mt-3 w-full" onClick={onBulk} disabled={busy}>
            <Sparkles size={13} /> まとめて取得する
          </Button>
        </Card>
      )}
    </div>
  );
}

function regimeLabel(s: number): string {
  if (s >= 70) return "追い風";
  if (s >= 55) return "やや追い風";
  if (s >= 45) return "中立";
  if (s >= 30) return "やや逆風";
  return "逆風";
}
