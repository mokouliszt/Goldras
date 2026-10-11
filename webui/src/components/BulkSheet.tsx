import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { api, effortLabel, type AppState, type BulkOptions, type BulkPlan } from "@/lib/native";
import { Button, Card, Segmented, Sheet, SheetContent, Switch } from "./ui";

/**
 * AIを使う処理をまとめて流すための入口。
 *
 * 銘柄を1つずつ開いてボタンを押して回るのは現実的でないので、
 * ここから対象と内容を選んで一度に実行する。
 * 実行前に「何件が対象か」を必ず見せる。ChatGPTの枠を使う操作なので、
 * 押した結果どれだけ消費するかが分からないまま走らせない。
 */
export function BulkSheet({
  open, onOpenChange, state, busy, progress, onRun, onStop,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: AppState;
  busy: boolean;
  progress: { label: string; done: number; total: number } | null;
  onRun: (o: BulkOptions) => void;
  onStop: () => void;
}) {
  const [scope, setScope] = useState<"stale" | "all">("stale");
  const [withForecast, setWithForecast] = useState(false);
  const [plan, setPlan] = useState<BulkPlan>({ all: [], stale: [], macroStale: false, days: 7 });

  // 開いたときと、実行が終わったときに対象を数え直す
  useEffect(() => {
    if (open) setPlan(api.bulkPlan());
  }, [open, busy]);

  const targets = scope === "all" ? plan.all : plan.stale;
  const macroIncluded = scope === "all" || plan.macroStale;
  const steps = targets.length * (withForecast ? 2 : 1) + (macroIncluded ? 1 : 0);

  const { model, effort } = state.settings;
  const usage = `（モデル: ${model || "自動"}／思考の深さ: ${effort ? effortLabel(effort) : "自動"}）`;

  const run = () => {
    if (!state.loggedIn) { api.login(); return; }
    onRun({
      force: scope === "all",
      macro: true,
      fundamentals: true,
      forecast: withForecast,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="AIでまとめて更新">
        <div className="space-y-4 pb-2">
          {busy && progress ? (
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-bullion" />
                <span className="disp text-[13px]">{progress.label}</span>
              </div>
              <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-vein">
                <div
                  className="h-full rounded-full bg-bullion transition-[width] duration-300"
                  style={{ width: `${((progress.done) / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <p className="fig mt-2 text-[11px] text-ore">
                {progress.done} / {progress.total} 件が完了
              </p>
              <Button variant="outline" className="mt-3 w-full" onClick={onStop}>
                <X size={13} /> 中止する
              </Button>
              <p className="mt-2 text-[11px] leading-snug text-ore">
                中止しても、そこまでに取得できた分は保存されています。
              </p>
            </Card>
          ) : (
            <>
              <div>
                <span className="eyebrow">対象</span>
                <Segmented
                  className="mt-2"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: "stale", label: `古いものだけ (${plan.stale.length})` },
                    { value: "all", label: `すべて (${plan.all.length})` },
                  ]}
                />
                <p className="mt-2 text-[11px] leading-snug text-ore">
                  {scope === "stale"
                    ? `${plan.days}日以上更新されていない銘柄だけを調べます。`
                    : "鮮度に関わらず全銘柄を調べ直します。枠の消費が大きくなります。"}
                </p>
              </div>

              <Card className="p-3.5">
                <span className="eyebrow">内容</span>
                <div className="mt-2 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-[12.5px]">基礎情報と金の需給</span>
                      <p className="text-[11px] leading-snug text-ore">
                        採掘コスト・ガイダンス・危険信号・中銀買い。買い場スコアの精度に直結します
                      </p>
                    </div>
                    <span className="fig text-[11px] text-ore">必須</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="flex-1">
                      <span className="text-[12.5px]">シナリオ予測も作る</span>
                      <p className="text-[11px] leading-snug text-ore">
                        銘柄ごとに3ヶ月と12ヶ月の見通しを生成し、予測ログに記録します。
                        処理時間と消費が約2倍になります
                      </p>
                    </div>
                    <Switch checked={withForecast} onCheckedChange={setWithForecast} />
                  </div>
                </div>
              </Card>

              <Card className="border-bullion/25 p-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] text-ore">実行するAI処理</span>
                  <span className="fig text-[17px] text-bullion">{steps} 件</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-ore">
                  {steps === 0
                    ? "すべて最新です。実行する必要はありません。"
                    : `1件あたり1〜2分程度かかります${usage}。`}
                </p>
              </Card>

              <Button className="w-full" size="lg" onClick={run} disabled={busy || steps === 0}>
                <Sparkles size={14} />
                {state.loggedIn ? "まとめて実行" : "ChatGPTにログインして実行"}
              </Button>

              <p className="text-[11px] leading-snug text-ore">
                実行中もアプリは操作できます。終わるまで通信を保つため、通知欄に実行中の表示が出ます。
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
