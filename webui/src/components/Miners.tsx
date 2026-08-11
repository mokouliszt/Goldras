import { useState } from "react";
import { AlertTriangle, ExternalLink, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import type { AppState, Category, Prediction, TickerDef } from "@/lib/native";
import { api } from "@/lib/native";
import { Badge, Button, Card, Input, Row, Sheet, SheetContent } from "./ui";
import { ChangeRow, PartBar, ScoreDial, Spark } from "./Charts";
import { MarginBar } from "./MarginBar";
import {
  ago, catColor, catLabel, dateJp, isNum, pct, scoreColor, signColor, usd, verdictLabel,
} from "@/lib/fmt";

const ORDER: Category[] = ["royalty", "senior", "mid"];

export function Miners({
  state, busy, open, setOpen, onResearch, onForecast, onAdd, onRemove,
}: {
  state: AppState;
  busy: boolean;
  open: string | null;
  setOpen: (t: string | null) => void;
  onResearch: (t: string) => void;
  onForecast: (t: string) => void;
  onAdd: (t: Partial<TickerDef>) => void;
  onRemove: (t: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const { universe, snapshot, scores, fundamentals } = state;
  const gold = snapshot.bench?.gold?.last;

  const groups = ORDER
    .map((c) => ({ cat: c, items: universe.tickers.filter((t) => t.category === c) }))
    .filter((g) => g.items.length > 0);

  const def = open ? universe.tickers.find((t) => t.ticker === open) : null;

  return (
    <div className="space-y-4 px-4 pb-6">
      {groups.map(({ cat, items }) => (
        <div key={cat}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="h-2.5 w-[3px] rounded-full" style={{ background: catColor[cat] }} />
            <span className="disp text-[13px]">{catLabel[cat]}</span>
            <span className="flex-1 text-[10.5px] leading-snug text-ore">
              {universe.categories?.[cat]?.desc}
            </span>
          </div>
          <Card className="overflow-hidden">
            <div className="divide-y divide-line/60">
              {items.map((d) => {
                const q = snapshot.quotes?.[d.ticker];
                const s = scores.tickers?.[d.ticker];
                const f = fundamentals?.[d.ticker];
                const warn = (f?.warnings ?? []).some((w) => w.severity === "high");
                return (
                  <button
                    key={d.ticker}
                    onClick={() => { api.haptic(); setOpen(d.ticker); }}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-vein"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="disp text-[15px]">{d.ticker}</span>
                        {warn && <AlertTriangle size={11} className="text-slag" />}
                        <span className="truncate text-[11px] text-ore">{d.name}</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="fig text-[13px]">{usd(q?.last)}</span>
                        <span className={`fig text-[11.5px] ${signColor(q?.chg3m)}`}>{pct(q?.chg3m)}</span>
                        <span className="text-[10px] text-ore">3ヶ月</span>
                      </div>
                      <div className="mt-1.5">
                        <MarginBar gold={gold} aisc={f?.aisc} category={d.category} compact />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Spark data={snapshot.series?.[d.ticker]?.slice(-64)} trend={q?.chg3m} width={54} height={22} />
                      {s && (
                        <div className="fig mt-1 text-[16px] font-semibold" style={{ color: scoreColor(s.score) }}>
                          {Math.round(s.score)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      ))}

      <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
        <Plus size={14} /> 銘柄を追加
      </Button>

      <Sheet open={!!def} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent title={def ? `${def.ticker} ${def.name}` : ""}>
          {def && (
            <MinerDetail
              def={def}
              state={state}
              busy={busy}
              onResearch={onResearch}
              onForecast={onForecast}
              onRemove={(t) => { onRemove(t); setOpen(null); }}
            />
          )}
        </SheetContent>
      </Sheet>

      <AddSheet open={adding} onOpenChange={setAdding} onAdd={onAdd} />
    </div>
  );
}

function MinerDetail({
  def, state, busy, onResearch, onForecast, onRemove,
}: {
  def: TickerDef;
  state: AppState;
  busy: boolean;
  onResearch: (t: string) => void;
  onForecast: (t: string) => void;
  onRemove: (t: string) => void;
}) {
  const q = state.snapshot.quotes?.[def.ticker];
  const s = state.scores.tickers?.[def.ticker];
  const f = state.fundamentals?.[def.ticker];
  const gold = state.snapshot.bench?.gold?.last;
  const preds = state.predictions.filter((p) => p.ticker === def.ticker).slice(0, 2);
  const royalty = def.category === "royalty";

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center gap-4">
        {s && <ScoreDial score={s.score} size={112} label={verdictLabel[s.verdict]} />}
        <div className="flex-1 space-y-2">
          <div>
            <span className="fig text-[24px] font-semibold">{usd(q?.last)}</span>
            <span className={`fig ml-2 text-[13px] ${signColor(q?.chg1d)}`}>{pct(q?.chg1d)}</span>
          </div>
          <ChangeRow
            items={[
              { label: "3M", value: q?.chg3m ?? NaN },
              { label: "12M", value: q?.chg12m ?? NaN },
              { label: "vs GDX", value: q?.relGdx12m ?? NaN },
            ]}
          />
          <div className="flex flex-wrap gap-1">
            <Badge tone={def.category === "royalty" ? "copper" : "neutral"}>{catLabel[def.category]}</Badge>
            <Badge tone={def.jurisdictionRisk > 50 ? "bad" : def.jurisdictionRisk > 30 ? "neutral" : "good"}>
              管轄リスク {def.jurisdictionRisk}
            </Badge>
          </div>
        </div>
      </div>

      {/* コスト構造 */}
      <Card className="p-3.5">
        <span className="eyebrow">{royalty ? "取得コスト構造" : "採掘コストとマージン"}</span>
        <div className="mt-2">
          <MarginBar gold={gold} aisc={f?.aisc} category={def.category} />
        </div>
        {!royalty && (
          <div className="mt-2.5">
            <Row label="AISC (直近四半期)" value={isNum(f?.aisc) ? `$${Math.round(f!.aisc!)}/oz` : "未取得"}
              sub={isNum(f?.aiscPrior) ? `前期 $${Math.round(f!.aiscPrior!)}` : undefined} />
            {f?.aiscGuidance && <Row label="通期ガイダンス" value={f.aiscGuidance} />}
            <Row
              label="コストの方向"
              value={guidanceLabel(f?.guidanceTrend)}
              tone={f?.guidanceTrend === "worsening" ? "bad" : f?.guidanceTrend === "improving" ? "good" : undefined}
            />
            <Row label="原油感応度 (推定)" value={`${def.oilSensitivity > 0 ? "+" : ""}${def.oilSensitivity.toFixed(2)}`}
              sub={def.oilSensitivity > 0 ? "原油高は増収" : def.oilSensitivity < 0 ? "原油高はコスト増" : "影響なし"} />
          </div>
        )}
        {!!f?.costDrivers?.length && (
          <div className="mt-2 border-t border-line pt-2">
            {f.costDrivers.map((c, i) => (
              <p key={i} className="text-[11.5px] leading-snug text-ore">・{c}</p>
            ))}
          </div>
        )}
      </Card>

      {/* 危険信号 */}
      {!!f?.warnings?.length && (
        <Card className="border-slag/35 bg-slag/[0.06] p-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-slag" />
            <span className="disp text-[13px] text-slag">危険信号</span>
          </div>
          <div className="space-y-2">
            {f.warnings.map((w, i) => (
              <div key={i}>
                <div className="flex items-start gap-1.5">
                  <Badge tone={w.severity === "high" ? "bad" : "neutral"}>{w.severity === "high" ? "重大" : "注意"}</Badge>
                  <span className="flex-1 text-[12.5px] leading-snug">{w.what}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ore">{w.why}</p>
              </div>
            ))}
          </div>
          {s?.capped && (
            <p className="mt-2 border-t border-slag/25 pt-2 text-[11px] leading-snug text-ore">
              重大な信号があるため、スコアに上限をかけています。
            </p>
          )}
        </Card>
      )}

      {/* 保有の根拠 */}
      {f?.thesis && (
        <Card className="p-3.5">
          <span className="eyebrow">1年持つ根拠</span>
          <p className="mt-1.5 text-[13px] leading-relaxed">{f.thesis}</p>
        </Card>
      )}

      {/* スコアの内訳 */}
      {s && (
        <Card className="p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">スコアの内訳</span>
            <span className="text-[10px] text-ore">値 / 重み</span>
          </div>
          <div className="mt-1">
            <PartBar label="割安度" value={s.parts.value} weight={s.weights.value} />
            <PartBar label="マージン" value={s.parts.margin} weight={s.weights.margin} />
            <PartBar label="マクロ" value={s.parts.macro} weight={s.weights.macro} />
            <PartBar label="需給" value={s.parts.flow} weight={s.weights.flow} />
          </div>
          {!!s.missing?.length && (
            <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-ore">
              未取得のため中立扱い: {s.missing.join(" / ")}
            </p>
          )}
        </Card>
      )}

      {/* 指標 */}
      <Card className="p-3.5">
        <span className="eyebrow">評価指標</span>
        <div className="mt-1.5">
          {isNum(f?.pnav) && <Row label="P/NAV" value={f!.pnav!.toFixed(2)}
            sub={isNum(f?.pnav5yAvg) ? `5年平均 ${f!.pnav5yAvg!.toFixed(2)}` : undefined} />}
          {isNum(f?.evEbitda) && <Row label="EV/EBITDA" value={f!.evEbitda!.toFixed(1)} />}
          {isNum(f?.fcfYield) && <Row label="FCF利回り" value={`${f!.fcfYield!.toFixed(1)}%`} />}
          {isNum(f?.dividendYield) && <Row label="配当利回り" value={`${f!.dividendYield!.toFixed(2)}%`} />}
          {isNum(f?.netDebtEbitda) && <Row label="純有利子負債/EBITDA" value={f!.netDebtEbitda!.toFixed(2)} />}
          {isNum(f?.reserveLifeYears) && <Row label="埋蔵量寿命" value={`${f!.reserveLifeYears}年`} />}
          {f?.hedged != null && <Row label="金のヘッジ" value={f.hedged ? "あり" : "なし"}
            tone={f.hedged ? "bad" : undefined} />}
          <Row label="RSI (14)" value={isNum(q?.rsi14) ? q!.rsi14.toFixed(0) : "—"} />
          <Row label="200日線乖離" value={pct(q?.distMa200)} tone={q && q.distMa200 < 0 ? "bad" : undefined} />
          <Row label="52週高値からの下落" value={pct(q?.drawdown)} />
        </div>
      </Card>

      {/* 事業の実態 */}
      <Card className="p-3.5">
        <span className="eyebrow">事業</span>
        <div className="mt-1.5 space-y-2">
          {!!def.jurisdictions?.length && (
            <div>
              <span className="text-[11.5px] text-ore">操業国</span>
              <p className="text-[12.5px] leading-snug">{def.jurisdictions.join("、")}</p>
            </div>
          )}
          {!!def.keyAssets?.length && (
            <div>
              <span className="text-[11.5px] text-ore">主力資産</span>
              <p className="text-[12.5px] leading-snug">{def.keyAssets.join("、")}</p>
            </div>
          )}
          {!!def.traits?.length && (
            <div className="border-t border-line pt-2">
              {def.traits.map((t, i) => (
                <p key={i} className="text-[12px] leading-snug text-ore">・{t}</p>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* カタリスト */}
      {!!f?.catalysts?.length && (
        <Card className="p-3.5">
          <span className="eyebrow">今後12ヶ月のカタリスト</span>
          <div className="mt-2 space-y-2">
            {f.catalysts.map((c, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="fig w-[54px] shrink-0 text-[11px] text-bullion">{c.when}</span>
                <span className="flex-1 text-[12.5px] leading-snug">{c.what}</span>
                <span className={`shrink-0 text-[11px] ${
                  c.impact === "up" ? "text-assay" : c.impact === "down" ? "text-slag" : "text-ore"}`}>
                  {c.impact === "up" ? "↑" : c.impact === "down" ? "↓" : "±"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 予測 */}
      {preds.length > 0 && (
        <Card className="p-3.5">
          <span className="eyebrow">直近の予測</span>
          <div className="mt-2 space-y-2.5">
            {preds.map((p) => <PredictionRow key={p.id} p={p} />)}
          </div>
        </Card>
      )}

      {/* 操作 */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => (state.loggedIn ? onResearch(def.ticker) : api.login())}
            disabled={busy}
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            {f ? "基礎情報を更新" : "基礎情報を取得"}
          </Button>
          <Button
            variant="outline" className="flex-1"
            onClick={() => (state.loggedIn ? onForecast(def.ticker) : api.login())}
            disabled={busy}
          >
            <TrendingUp size={13} /> 予測を作る
          </Button>
        </div>
        {f?.at && <p className="text-center text-[11px] text-ore">基礎情報 {ago(f.at)}
          {f.asOf ? ` / 参照 ${f.asOf}` : ""}</p>}
        {!state.loggedIn && (
          <p className="text-center text-[11.5px] text-ore">
            押すとChatGPTのログインに進みます
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {def.ir && (
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => api.openUrl(def.ir!)}>
              <ExternalLink size={12} /> IRページ
            </Button>
          )}
          <Button variant="danger" size="sm" className="flex-1" onClick={() => onRemove(def.ticker)}>
            <Trash2 size={12} /> 監視から外す
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PredictionRow({ p }: { p: Prediction }) {
  const hit = p.result?.directionHit;
  return (
    <div className="rounded-xl bg-vein/60 p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Badge tone="gold">{p.horizon === "3m" ? "3ヶ月" : "12ヶ月"}</Badge>
          <span className="text-[12px]">
            {p.direction === "up" ? "上昇" : p.direction === "down" ? "下落" : "横ばい"}
          </span>
        </span>
        <span className="fig text-[11px] text-ore">確度 {p.confidence}</span>
      </div>
      <div className="fig mt-1 text-[12.5px]">
        {isNum(p.low) && isNum(p.high)
          ? `$${p.low.toFixed(1)} 〜 $${p.high.toFixed(1)}`
          : "レンジなし"}
        <span className="ml-1.5 text-[11px] text-ore">起点 {usd(p.basePrice)}</span>
      </div>
      {p.result ? (
        <div className={`mt-1 text-[11.5px] ${hit ? "text-assay" : "text-slag"}`}>
          結果 {usd(p.result.actual)} — 方向{hit ? "的中" : "外れ"}
          {p.result.inRange ? " / レンジ内" : " / レンジ外"}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-ore">
          {dateJp(p.createdAt)} 作成 / {dateJp(p.dueAt)} 判定
        </div>
      )}
    </div>
  );
}

function AddSheet({
  open, onOpenChange, onAdd,
}: { open: boolean; onOpenChange: (v: boolean) => void; onAdd: (t: Partial<TickerDef>) => void }) {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [cat, setCat] = useState<Category>("mid");

  const submit = () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    onAdd({
      ticker: t,
      name: name.trim() || t,
      category: cat,
      oilSensitivity: cat === "royalty" ? 0 : -0.3,
      jurisdictionRisk: 40,
    });
    setTicker(""); setName("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="銘柄を追加">
        <div className="space-y-3 pb-2">
          <div>
            <label className="eyebrow">ティッカー</label>
            <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="NGD"
              autoCapitalize="characters" className="mt-1" />
          </div>
          <div>
            <label className="eyebrow">表示名</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ニュー・ゴールド" className="mt-1" />
          </div>
          <div>
            <label className="eyebrow">分類</label>
            <div className="mt-1 flex gap-2">
              {ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`flex-1 rounded-xl border py-2 text-[12px] transition-colors ${
                    cat === c ? "border-bullion/60 bg-vein text-bullion" : "border-line text-ore"
                  }`}
                >
                  {catLabel[c]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11.5px] leading-snug text-ore">
            操業国や主力資産などの詳細は、追加後に「基礎情報を取得」でAIが埋めます。
          </p>
          <Button className="w-full" onClick={submit} disabled={!ticker.trim()}>追加する</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function guidanceLabel(t?: string | null): string {
  if (t === "improving") return "改善";
  if (t === "worsening") return "悪化";
  if (t === "stable") return "横ばい";
  return "未取得";
}
