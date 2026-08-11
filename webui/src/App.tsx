import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Coins, LayoutGrid, MessageSquare, Settings2, Sparkles, Target } from "lucide-react";
import { api, emptyState, newReqId, on, type AppState, type BulkOptions, type Prediction, type TickerDef } from "@/lib/native";
import { Button, Card, Select, Sheet, SheetContent, Switch } from "./components/ui";
import { Today } from "./components/Today";
import { Macro } from "./components/Macro";
import { Miners } from "./components/Miners";
import { Signal } from "./components/Signal";
import { AiTab } from "./components/AiTab";
import { BulkSheet } from "./components/BulkSheet";
import { ago } from "@/lib/fmt";

/**
 * データの形が想定と食い違ったときに画面ごと死なせないための最終防御。
 * ネイティブ側の防御(Store.kt)とJS側の楽観的チェイニングでほぼ潰しているはずだが、
 * それでも取りこぼした場合はここで受け止めて再読み込みの導線を出す。
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("render error:", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-pit px-8 text-center">
        <p className="disp text-[16px]">表示できませんでした</p>
        <p className="fig max-w-xs text-[11px] leading-relaxed text-ore">
          {this.state.error.message}
        </p>
        <Button onClick={() => { this.setState({ error: null }); location.reload(); }}>
          再読み込み
        </Button>
      </div>
    );
  }
}

type Tab = "today" | "macro" | "miners" | "signal" | "ai";

const TABS: { id: Tab; label: string; icon: typeof Coins }[] = [
  { id: "today", label: "今日", icon: LayoutGrid },
  { id: "macro", label: "金", icon: Coins },
  { id: "miners", label: "銘柄", icon: BarChart3 },
  { id: "signal", label: "買い場", icon: Target },
  { id: "ai", label: "AI", icon: MessageSquare },
];

const TITLES: Record<Tab, string> = {
  today: "Goldras",
  macro: "金の需給",
  miners: "銘柄",
  signal: "買い場",
  ai: "AI",
};

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openTicker, setOpenTicker] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const reqRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setState(api.state()), []);

  // 起動・復帰時、まだ走っているジョブがあれば進捗表示に復帰する。
  // メモリ不足でActivityごと作り直された場合でも、処理自体は生きている。
  useEffect(() => {
    const s = api.state();
    if (s.activeRequest) {
      reqRef.current = s.activeRequest;
      setBusy(true);
      if (s.progress) setProgress({ label: s.progress.label, done: s.progress.done, total: s.progress.total });
    }
  }, []);

  useEffect(() => {
    reload();
    const offs = [
      on("auth", () => reload()),
      on("snapshot", (p) => { finish(p); reload(); }),
      on("fundamental", (p) => { finish(p); reload(); }),
      on("macro", (p) => { finish(p); reload(); }),
      on("forecast", (p) => { finish(p); reload(); setToast("予測を記録しました"); }),
      on("tool", (p) => { if (p.reqId === reqRef.current) setToast(p.label); }),
      on("progress", (p) => {
        if (p.reqId !== reqRef.current) return;
        setProgress({ label: p.label, done: p.done, total: p.total });
      }),
      on("autoAnalyze", (p) => { finish(p); setProgress(null); reload(); }),
      // 通知の「中止」から止められた場合も画面を実行中のままにしない
      on("cancelled", () => {
        reqRef.current = null;
        setBusy(false);
        setProgress(null);
        reload();
        setToast("中止しました。取得できた分は保存されています");
      }),
      on("error", (p) => {
        if (p.reqId !== reqRef.current) return;
        // soft は「一部だけ失敗した」通知。処理自体は続いているので実行中表示を消さない
        if (!p.soft) { finish(p); setProgress(null); }
        // AIを使う操作で未ログインだった場合は、そのままログインへ送る
        if (p.needLogin) { setToast("ChatGPTへのログインが必要です"); api.login(); return; }
        setToast(p.message ?? "処理に失敗しました");
      }),
    ];
    return () => offs.forEach((f) => f());
    function finish(p: any) {
      if (p?.reqId && p.reqId !== reqRef.current) return;
      reqRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // 初回、データが空なら自動で取りにいく。空の画面を見せない。
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (!state.universe.tickers.length) return;
    if (state.snapshot.at) { autoRan.current = true; return; }
    if (!state.settings.autoRefresh) { autoRan.current = true; return; }
    autoRan.current = true;
    run((id) => api.refresh(id));
  }, [state.universe.tickers.length, state.snapshot.at, state.settings.autoRefresh]);

  // AI更新の自動実行。価格の取得が終わってから、手が空いたときに1度だけ走らせる。
  // 対象は古くなっているものだけで、絞り込みはネイティブ側が行う。
  const autoAiRan = useRef(false);
  useEffect(() => {
    if (autoAiRan.current) return;
    if (!state.settings.autoAnalyze || !state.loggedIn) return;
    if (!state.universe.tickers.length) return;
    if (!state.snapshot.at) return; // 価格が入るまで待つ
    if (busy) return;
    autoAiRan.current = true;
    run((id) => api.autoAnalyze(id));
  }, [state.settings.autoAnalyze, state.loggedIn, state.universe.tickers.length, state.snapshot.at, busy]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [tab]);

  function run(fn: (id: string) => void) {
    if (busy) return;
    const id = newReqId();
    reqRef.current = id;
    setBusy(true);
    fn(id);
  }

  const onRefresh = () => run((id) => api.refresh(id));
  const onResearch = (t: string) => run((id) => api.research(id, t));
  const onMacro = () => run((id) => api.researchMacro(id));
  const onForecast = (t: string) => run((id) => api.forecast(id, t));

  const onBulk = (o: BulkOptions) => run((id) => api.bulk(id, o));
  const onStop = () => {
    if (reqRef.current) api.cancel(reqRef.current);
    reqRef.current = null;
    setBusy(false);
    setProgress(null);
    reload();
  };

  const onAdd = (d: Partial<TickerDef>) => { api.addTicker(d); reload(); onRefresh(); };
  const onRemove = (t: string) => { api.removeTicker(t); reload(); };
  const onPredictions = (p: Prediction[]) => setState((s) => ({ ...s, predictions: p }));

  const openMiner = (t: string) => { setTab("miners"); setOpenTicker(t); };

  return (
    <div className="flex h-full flex-col bg-pit" style={{ height: "var(--vh, 100vh)" }}>
      {/* ヘッダー */}
      <header
        className="z-20 flex items-center justify-between border-b border-line bg-pit px-4 pb-2"
        style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
      >
        <div>
          <h1 className="disp text-[19px] leading-none">{TITLES[tab]}</h1>
          <p className="fig mt-0.5 text-[10.5px] text-ore">
            {progress
              ? `${progress.label} (${progress.done + 1}/${progress.total})`
              : (state.snapshot.at ? `市場データ ${ago(state.snapshot.at)}` : "市場データ未取得")}
            {busy && !progress && " · 実行中"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkOpen(true)}
            className={`relative rounded-xl border p-2 active:scale-95 ${
              busy ? "border-bullion/50 text-bullion" : "border-line text-ore"
            }`}
            aria-label="AIでまとめて更新"
          >
            <Sparkles size={16} className={busy ? "pulse" : ""} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-xl border border-line p-2 text-ore active:scale-95"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {/* 本文 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-3" style={{ WebkitOverflowScrolling: "touch" }}>
        <ErrorBoundary>
          {tab === "today" && (
            <Today state={state} busy={busy} onRefresh={onRefresh} onOpen={openMiner}
              onGoSignal={() => setTab("signal")} onBulk={() => setBulkOpen(true)} />
          )}
          {tab === "macro" && <Macro state={state} busy={busy} onResearch={onMacro} />}
          {tab === "miners" && (
            <Miners
              state={state} busy={busy}
              open={openTicker} setOpen={setOpenTicker}
              onResearch={onResearch} onForecast={onForecast}
              onAdd={onAdd} onRemove={onRemove}
            />
          )}
          {tab === "signal" && <Signal state={state} onOpen={openMiner} />}
          {tab === "ai" && <AiTab state={state} onPredictionsChange={onPredictions} />}
        </ErrorBoundary>
      </div>

      {/* トースト */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-4 z-30" style={{ bottom: "calc(var(--safe-bottom) + 74px)" }}>
          <div className="rise mx-auto max-w-sm rounded-xl border border-line bg-vein px-3.5 py-2.5 text-[12.5px] shadow-2xl">
            {toast}
          </div>
        </div>
      )}

      {/* タブバー */}
      <nav
        className="z-20 flex border-t border-line bg-pit"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { api.haptic(); setTab(t.id); }}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 active:scale-95"
            >
              <Icon size={17} className={active ? "text-bullion" : "text-ore"} />
              <span className={`disp text-[10px] ${active ? "text-bullion" : "text-ore"}`}>{t.label}</span>
            </button>
          );
        })}
      </nav>

      <BulkSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        state={state}
        busy={busy}
        progress={progress}
        onRun={onBulk}
        onStop={onStop}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        state={state}
        onChange={reload}
      />
    </div>
  );
}

function SettingsSheet({
  open, onOpenChange, state, onChange,
}: { open: boolean; onOpenChange: (v: boolean) => void; state: AppState; onChange: () => void }) {
  const s = state.settings;
  const save = (patch: Partial<typeof s>) => { api.saveSettings(patch); onChange(); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="設定">
        <div className="space-y-4 pb-2">
          <Card className="p-3.5">
            <span className="eyebrow">ChatGPT</span>
            <p className="mt-1 text-[12.5px] text-ore">
              {state.loggedIn
                ? "ログイン中。分析はあなたのサブスクリプション枠で実行されます。"
                : "未ログイン。価格の計算のみ利用できます。"}
            </p>
            <Button
              variant={state.loggedIn ? "outline" : "default"}
              className="mt-2.5 w-full"
              onClick={() => (state.loggedIn ? api.logout() : api.login())}
            >
              {state.loggedIn ? "ログアウト" : "ChatGPTでログイン"}
            </Button>
          </Card>

          <Card className="p-3.5">
            <span className="eyebrow">モデル</span>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px]">モデル</span>
                <Select
                  value={s.model}
                  onValueChange={(v) => save({ model: v })}
                  options={state.models.map((m) => ({ value: m, label: m }))}
                  className="min-w-[150px]"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px]">思考の深さ</span>
                <Select
                  value={s.effort}
                  onValueChange={(v) => save({ effort: v })}
                  options={state.efforts.map((e) => ({ value: e, label: e }))}
                  className="min-w-[110px]"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ore">
              決算資料の読解には深めの設定が向きます。枠の消費も増えます。
            </p>
          </Card>

          <Card className="p-3.5">
            <span className="eyebrow">通知</span>
            <div className="mt-2 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[12.5px]">重要イベントを通知</span>
                  <p className="text-[11px] leading-snug text-ore">
                    日々の値動きは通知しません。急変や地合いの転換、鉱山の停止など判断に効く変化のみ。
                  </p>
                </div>
                <Switch checked={s.alerts} onCheckedChange={(v) => save({ alerts: v })} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px]">急変とみなす閾値</span>
                <Select
                  value={String(s.moveThreshold)}
                  onValueChange={(v) => save({ moveThreshold: Number(v) })}
                  options={[5, 7, 10, 15].map((n) => ({ value: String(n), label: `1日 ${n}%` }))}
                  className="min-w-[110px]"
                />
              </div>
            </div>
          </Card>

          <Card className="p-3.5">
            <span className="eyebrow">起動時の自動実行</span>
            <div className="mt-2 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[12.5px]">市場データを取得</span>
                  <p className="text-[11px] leading-snug text-ore">
                    株価・金・原油・実質金利。通信量はごくわずかです
                  </p>
                </div>
                <Switch checked={s.autoRefresh} onCheckedChange={(v) => save({ autoRefresh: v })} />
              </div>

              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[12.5px]">AI分析もまとめて更新</span>
                    <p className="text-[11px] leading-snug text-ore">
                      採掘コスト・ガイダンス・金の需給を調べ直します。
                      ChatGPTの利用枠を消費するため、古くなったものだけが対象です。
                    </p>
                  </div>
                  <Switch
                    checked={s.autoAnalyze}
                    onCheckedChange={(v) => {
                      // 未ログインのまま有効にしても動かないので、その場でログインへ送る
                      if (v && !state.loggedIn) { api.login(); return; }
                      save({ autoAnalyze: v });
                    }}
                  />
                </div>

                {s.autoAnalyze && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[12.5px]">更新とみなす間隔</span>
                    <Select
                      value={String(s.autoAnalyzeDays)}
                      onValueChange={(v) => save({ autoAnalyzeDays: Number(v) })}
                      options={[3, 7, 14, 30].map((n) => ({ value: String(n), label: `${n}日以上前` }))}
                      className="min-w-[120px]"
                    />
                  </div>
                )}

                {!state.loggedIn && (
                  <p className="mt-2 text-[11px] leading-snug text-ore">
                    有効にするにはChatGPTへのログインが必要です。
                  </p>
                )}
                {s.autoAnalyze && state.loggedIn && (
                  <p className="mt-2 text-[11px] leading-snug text-ore">
                    モデルと思考の深さは上の設定を使います。
                    銘柄数が多いと1回の起動で枠を多く消費します。
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-3.5">
            <span className="eyebrow">このアプリについて</span>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ore">
              価格・金利・原油は公開データから端末内で計算し、採掘コストや現地の動向は
              ChatGPTのサブスクリプション枠で調べます。データはすべて端末内に保存され、
              外部への同期は行いません。
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ore">
              表示される内容は投資判断の材料であって、助言ではありません。
              数値には取得できていないものや推定値が含まれます。
            </p>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
