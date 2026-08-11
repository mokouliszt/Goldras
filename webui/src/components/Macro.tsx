import { RefreshCw, ExternalLink } from "lucide-react";
import type { AppState } from "@/lib/native";
import { api } from "@/lib/native";
import { Badge, Button, Card, Row } from "./ui";
import { PartBar, Spark } from "./Charts";
import { ago, isNum, pct, scoreColor } from "@/lib/fmt";

/**
 * 金そのものの需給。個別銘柄の前に、まず金の側の話。
 * 実質金利とドルは端末で計算できる。中銀買い・ETF・建玉はAI更新で入る。
 */
export function Macro({
  state, busy, onResearch,
}: { state: AppState; busy: boolean; onResearch: () => void }) {
  const b = state.snapshot.bench ?? {};
  const m = state.macro ?? {};
  const parts = state.scores.gold?.parts;
  const hasAi = !!m.at;

  return (
    <div className="space-y-3.5 px-4 pb-6">
      <Card className="rise p-4">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">地合いの内訳</span>
          <span className="fig text-[20px] font-semibold" style={{ color: scoreColor(state.scores.gold?.score ?? 50) }}>
            {Math.round(state.scores.gold?.score ?? 50)}
          </span>
        </div>
        <div className="mt-2">
          {parts && (
            <>
              <PartBar label="実質金利" value={parts.realRate} />
              <PartBar label="ドル" value={parts.dxy} />
              <PartBar label="モメンタム" value={parts.momentum} />
              <PartBar label="中銀買い" value={parts.centralBank} />
              <PartBar label="ETF資金" value={parts.etfFlow} />
              <PartBar label="投機筋" value={parts.positioning} />
            </>
          )}
        </div>
        {!hasAi && (
          <p className="mt-2 border-t border-line pt-2 text-[11.5px] leading-snug text-ore">
            下3項目はAI更新で埋まります。未取得の間は中立の50として計算しています。
          </p>
        )}
      </Card>

      {/* 端末側で計算できる指標 */}
      <Card className="rise p-4">
        <span className="eyebrow">市場指標</span>
        <div className="mt-1.5">
          <Row
            label="実質金利 (10年TIPS)"
            value={isNum(b.realRate?.last) ? `${b.realRate.last.toFixed(2)}%` : "—"}
            sub={isNum(b.realRate?.chg3m) ? `3ヶ月 ${b.realRate.chg3m >= 0 ? "+" : ""}${b.realRate.chg3m.toFixed(2)}` : undefined}
          />
          <Row label="金" value={isNum(b.gold?.last) ? `$${Math.round(b.gold.last).toLocaleString()}` : "—"}
            sub={pct(b.gold?.chg3m)} />
          <Row label="銀" value={isNum(b.silver?.last) ? `$${b.silver.last.toFixed(2)}` : "—"}
            sub={pct(b.silver?.chg3m)} />
          <Row label="金銀比" value={
            isNum(b.gold?.last) && isNum(b.silver?.last) && b.silver.last > 0
              ? (b.gold.last / b.silver.last).toFixed(1) : "—"} />
          <Row label="ドル指数" value={isNum(b.dxy?.last) ? b.dxy.last.toFixed(1) : "—"} sub={pct(b.dxy?.chg3m)} />
          <Row label="WTI原油" value={isNum(b.oil?.last) ? `$${b.oil.last.toFixed(1)}` : "—"} sub={pct(b.oil?.chg3m)} />
          <Row label="米10年金利" value={isNum(b.ust10?.last) ? `${b.ust10.last.toFixed(2)}%` : "—"} />
          <Row label="金鉱株ETF (GDX)" value={isNum(b.gdx?.last) ? `$${b.gdx.last.toFixed(2)}` : "—"}
            sub={pct(b.gdx?.chg3m)} />
        </div>
        {isNum(b.gold?.last) && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="eyebrow">金 2年</span>
              <span className="text-[11px] text-ore">
                200日線 {isNum(b.gold?.ma200) ? `$${Math.round(b.gold.ma200).toLocaleString()}` : "—"}
              </span>
            </div>
            <Spark data={b.gold?.spark} width={300} height={54} color="var(--bullion)" />
          </div>
        )}
      </Card>

      {/* AI が取ってくる需給 */}
      <Card className="rise overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
          <span className="eyebrow">需給の実態</span>
          <span className="text-[11px] text-ore">{hasAi ? ago(m.at) : "未取得"}</span>
        </div>

        {hasAi ? (
          <div className="space-y-3 px-4 pb-4">
            {m.summary && <p className="text-[13px] leading-relaxed">{m.summary}</p>}

            <div className="space-y-2.5">
              <Block
                title="中央銀行の買い"
                badge={m.centralBank?.trend ?? undefined}
                value={isNum(m.centralBank?.recentTonnes) ? `${m.centralBank!.recentTonnes} トン` : undefined}
                note={m.centralBank?.note}
              />
              <Block
                title="金ETFの資金"
                badge={m.etfFlow?.trend ?? undefined}
                value={isNum(m.etfFlow?.recentTonnes)
                  ? `${m.etfFlow!.recentTonnes! >= 0 ? "+" : ""}${m.etfFlow!.recentTonnes} トン` : undefined}
                note={m.etfFlow?.note}
              />
              <Block
                title="投機筋のポジション"
                badge={m.positioning?.extreme ? "極端" : undefined}
                value={isNum(m.positioning?.netLongPercentile)
                  ? `過去5年の ${Math.round(m.positioning!.netLongPercentile!)}%tile` : undefined}
                note={m.positioning?.note}
              />
              {m.supply?.note && <Block title="供給" note={m.supply.note} />}
            </div>

            {!!m.themes?.length && (
              <div className="space-y-2 border-t border-line pt-3">
                <span className="eyebrow">効いているテーマ</span>
                {m.themes.map((t, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${t.direction === "up" ? "bg-assay" : "bg-slag"}`} />
                      <span className="text-[12.5px]">{t.title}</span>
                    </div>
                    <p className="ml-3 text-[11.5px] leading-snug text-ore">{t.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {!!m.sources?.length && (
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                {m.sources.slice(0, 5).map((u, i) => (
                  <button
                    key={i}
                    onClick={() => api.openUrl(u)}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ore"
                  >
                    <ExternalLink size={9} />
                    {hostOf(u)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 pb-4">
            <p className="text-[12.5px] leading-relaxed text-ore">
              中央銀行の購入量、ETFの資金流出入、COMEXの投機筋ポジションはAPIで取れないため、
              AIがweb検索で拾ってきます。近年は実質金利より中銀買いのほうが金価格を説明しています。
            </p>
          </div>
        )}

        <button
          onClick={() => (state.loggedIn ? onResearch() : api.login())}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-[11.5px] text-bullion active:bg-vein disabled:opacity-40"
        >
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          {state.loggedIn ? "AIで需給を調べる" : "ChatGPTにログインして調べる"}
        </button>
      </Card>
    </div>
  );
}

function Block({
  title, value, note, badge,
}: { title: string; value?: string; note?: string; badge?: string }) {
  return (
    <div className="rounded-xl bg-vein/60 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink">{title}</span>
        {badge && <Badge tone="gold">{badge}</Badge>}
      </div>
      {value && <div className="fig mt-0.5 text-[15px] text-bullion">{value}</div>}
      {note && <p className="mt-0.5 text-[11.5px] leading-snug text-ore">{note}</p>}
    </div>
  );
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; }
}
