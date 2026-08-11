import type { AppState, Verdict } from "@/lib/native";
import { Badge, Card } from "./ui";
import { PartBar, Spark } from "./Charts";
import { catColor, catLabel, isNum, pct, scoreColor, signColor, usd, verdictLabel } from "@/lib/fmt";

const BANDS: { verdict: Verdict; range: string; note: string }[] = [
  { verdict: "accumulate", range: "70+", note: "割安かつマージンに余裕。買い増しを検討する水準" },
  { verdict: "starter", range: "55-69", note: "条件は整いつつある。分割で入る水準" },
  { verdict: "wait", range: "40-54", note: "特に有利でも不利でもない。動く理由がない" },
  { verdict: "trim", range: "40未満", note: "割高かコストが重い。新規で買う根拠が乏しい" },
];

/**
 * 予測ではなく「今の位置」を示す画面。
 * 1年保有が前提なので、順位より判定の帯のほうを主役にしている。
 */
export function Signal({ state, onOpen }: { state: AppState; onOpen: (t: string) => void }) {
  const { universe, snapshot, scores, fundamentals } = state;

  const ranked = universe.tickers
    .map((d) => ({ def: d, s: scores.tickers?.[d.ticker], q: snapshot.quotes?.[d.ticker] }))
    .filter((x) => x.s && x.q)
    .sort((a, b) => b.s.score - a.s.score);

  if (ranked.length === 0) {
    return (
      <div className="px-4 pb-6">
        <Card className="p-5 text-center">
          <p className="text-[13px] leading-relaxed text-ore">
            市場データを取得するとスコアが計算されます。
          </p>
        </Card>
      </div>
    );
  }

  const grouped = BANDS.map((b) => ({ ...b, items: ranked.filter((r) => r.s.verdict === b.verdict) }));

  return (
    <div className="space-y-4 px-4 pb-6">
      {grouped.filter((g) => g.items.length > 0).map((g) => (
        <div key={g.verdict}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="disp text-[14px]" style={{ color: scoreColor(bandScore(g.verdict)) }}>
              {verdictLabel[g.verdict]}
            </span>
            <span className="fig text-[10.5px] text-ore">{g.range}</span>
          </div>
          <p className="mb-1.5 text-[11px] leading-snug text-ore">{g.note}</p>
          <Card className="overflow-hidden">
            <div className="divide-y divide-line/60">
              {g.items.map(({ def, s, q }) => (
                <button
                  key={def.ticker}
                  onClick={() => onOpen(def.ticker)}
                  className="w-full px-3.5 py-3 text-left active:bg-vein"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-[3px] shrink-0 rounded-full"
                      style={{ background: catColor[def.category] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="disp text-[15px]">{def.ticker}</span>
                        <span className="text-[10.5px] text-ore">{catLabel[def.category]}</span>
                        {s.capped && <Badge tone="bad">上限</Badge>}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <span className="fig text-[12.5px]">{usd(q.last)}</span>
                        <span className={`fig text-[11px] ${signColor(q.chg12m)}`}>{pct(q.chg12m)}</span>
                        <span className="text-[10px] text-ore">12M</span>
                        {isNum(s.marginPct) && (
                          <span className="fig text-[11px] text-bullion">マージン{s.marginPct.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Spark data={snapshot.series?.[def.ticker]?.slice(-64)} trend={q?.chg3m} width={50} height={20} />
                      <div className="fig mt-0.5 text-[18px] font-semibold" style={{ color: scoreColor(s.score) }}>
                        {Math.round(s.score)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 pl-[15px]">
                    <PartBar label="割安度" value={s.parts.value} />
                    <PartBar label="マージン" value={s.parts.margin} />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      ))}

      <Card className="p-4">
        <span className="eyebrow">スコアの作り方</span>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ore">
          1年程度の保有を前提に、割安度とマージンを重く見ています。
          3ヶ月先の株価を当てにいく指標ではなく、
          「今の株価が過去のレンジと採算構造から見てどのあたりか」を示すものです。
        </p>
        <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
          <Weight label="割安度" w={30} desc="52週レンジ内の位置、200日線乖離、GDX比の出遅れ。P/NAVが取れていればそれを主軸に" />
          <Weight label="マージン" w={25} desc="金価格に対するAISCの余裕と、ガイダンス改定の方向。ロイヤリティ社は金価格モメンタムで代替" />
          <Weight label="マクロ" w={25} desc="実質金利、ドル、金のトレンド、原油。原油の符号は業態で反転" />
          <Weight label="需給" w={20} desc="RSI、52週高値からの下落率" />
        </div>
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11.5px] leading-snug text-ore">
          重大な危険信号がある銘柄はスコアに上限がかかります。どれだけ安く見えても、
          鉱山が止まっている会社を「買い」とは表示しません。
        </p>
      </Card>
    </div>
  );
}

function Weight({ label, w, desc }: { label: string; w: number; desc: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="fig w-[30px] shrink-0 text-[12px] text-bullion">{w}%</span>
      <div className="flex-1">
        <span className="text-[12px] text-ink">{label}</span>
        <p className="text-[11px] leading-snug text-ore">{desc}</p>
      </div>
    </div>
  );
}

const bandScore = (v: Verdict) => (v === "accumulate" ? 75 : v === "starter" ? 60 : v === "wait" ? 47 : 30);
