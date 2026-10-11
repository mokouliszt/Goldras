import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Coins, LayoutGrid, MessageSquare, Settings2, Sparkles, Target } from "lucide-react";
import {
  api, effortLabel, emptyState, newReqId, on,
  type AppState, type BulkOptions, type CodexAccount, type CodexDownload, type CodexModel, type Prediction, type TickerDef,
} from "@/lib/native";
import { Button, Card, Select, Sheet, SheetContent, Switch } from "./components/ui";
import { LoginSheet, type LoginState } from "./components/LoginSheet";
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [login, setLogin] = useState<LoginState>({ phase: "idle" });
  const loginReq = useRef<string | null>(null);
  // モデルの一覧は Codex から取る。アプリ側には持たない
  const [codex, setCodex] = useState<CodexPanel>({ models: null, account: null });
  const [download, setDownload] = useState<CodexDownload | null>(null);
  const reqRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setState(api.state()), []);

  // 起動・復帰時、まだ走っているジョブがあれば進捗表示に復帰する。
  // メモリ不足でActivityごと作り直された場合でも、処理自体は生きている。
  useEffect(() => {
    const s = api.state();
    if (s.codex?.updating) setDownload(s.codex.updating);
    if (s.activeRequest) {
      reqRef.current = s.activeRequest;
      setBusy(true);
      if (s.progress) setProgress({ label: s.progress.label, done: s.progress.done, total: s.progress.total });
    }
  }, []);

  useEffect(() => {
    reload();
    const offs = [
      on("auth", (p) => {
        reload();
        setCodex({ models: null, account: null });
        if (p?.loggedIn && loginReq.current) {
          loginReq.current = null;
          setLogin({ phase: "idle" });
          setLoginOpen(false);
          setToast("ChatGPTにログインしました");
        }
      }),
      on("openLogin", () => { setLogin({ phase: "idle" }); setLoginOpen(true); }),
      on("codexLoginStarted", (p) => {
        if (p.reqId !== loginReq.current) return;
        setLogin(p.device
          ? { phase: "device", verificationUrl: p.verificationUrl, userCode: p.userCode }
          : { phase: "browser" });
      }),
      on("loginFailed", (p) => {
        if (p.reqId !== loginReq.current) return;
        loginReq.current = null;
        setLogin({ phase: "idle" });
        setToast(p.message ?? "ログインに失敗しました");
      }),
      on("codexModels", (p) => setCodex({ models: p.models ?? [], account: p.account ?? null, error: p.error })),
      on("codexUpdate", (p) => {
        setDownload(null);
        setCodex((c) => ({ ...c, checking: false, available: p.available || undefined }));
        reload();
        if (p.updated) setToast(`Codex を v${p.updated} に更新しました`);
        else if (p.error) setToast(p.error);
        else if (p.upToDate && p.reqId) setToast("Codex は最新です");
      }),
      on("codexUpdateProgress", (p) => setDownload(p)),
      on("notice", (p) => setToast(p.message)),
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

  const startLogin = (device: boolean) => {
    const id = newReqId();
    loginReq.current = id;
    setLogin({ phase: device ? "device" : "browser" });
    api.startLogin(id, device);
  };
  const cancelLogin = () => {
    if (loginReq.current) api.cancelLogin();
    loginReq.current = null;
    setLogin({ phase: "idle" });
  };

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
        codex={codex}
        download={download}
        onLoadModels={() => api.codexModels(newReqId())}
        onCheckUpdate={() => { setCodex((c) => ({ ...c, checking: true })); api.codexCheckUpdate(newReqId()); }}
        onUpdate={() => { setDownload({ version: state.codex.update.latest, done: 0, total: 0 }); api.codexUpdate(newReqId()); }}
      />

      <LoginSheet
        open={loginOpen}
        onOpenChange={(v) => { setLoginOpen(v); if (!v) cancelLogin(); }}
        state={login}
        onStart={startLogin}
        onCancel={cancelLogin}
      />
    </div>
  );
}

interface CodexPanel {
  models: CodexModel[] | null;
  account: CodexAccount | null;
  error?: string;
  checking?: boolean;
  available?: string;
}

/** プラン名は小文字の識別子で届く（plus, pro など）。頭だけ大文字にして出す。 */
const planName = (p: string) => (p === "unknown" ? "" : p.charAt(0).toUpperCase() + p.slice(1)).replace(/_/g, " ");

/** Select は空文字を値にできないので、「デフォルトに任せる」をこの値で表す。 */
const AUTO = "__auto__";

const newerThan = (a: string, b: string) => {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
};

function SettingsSheet({
  open, onOpenChange, state, onChange, codex, download, onLoadModels, onCheckUpdate, onUpdate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: AppState;
  onChange: () => void;
  codex: CodexPanel;
  download: CodexDownload | null;
  onLoadModels: () => void;
  onCheckUpdate: () => void;
  onUpdate: () => void;
}) {
  const s = state.settings;
  const save = (patch: Partial<typeof s>) => { api.saveSettings(patch); onChange(); };

  // 開くたびに取り直す。一覧は Codex 側で変わる
  useEffect(() => {
    if (open && state.loggedIn && state.codex.bundled) onLoadModels();
  }, [open, state.loggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const models = codex.models;
  const defaultModel = models?.find((m) => m.isDefault) ?? models?.[0];
  const pinned = s.model ? models?.find((m) => m.id === s.model) : undefined;
  const pinnedMissing = !!s.model && !!models && models.length > 0 && !pinned;
  const current = pinned ?? defaultModel;

  const modelOptions = [
    { value: AUTO, label: "自動" },
    ...(models ?? []).map((m) => ({ value: m.id, label: m.displayName })),
    ...(s.model && !pinned ? [{ value: s.model, label: pinnedMissing ? `${s.model}（現在は使えません）` : s.model }] : []),
  ];
  const efforts = current?.efforts ?? [];
  const effortOptions = [
    { value: AUTO, label: "自動" },
    ...efforts.map((e) => ({ value: e, label: effortLabel(e) })),
    ...(s.effort && !efforts.includes(s.effort)
      ? [{ value: s.effort, label: efforts.length ? `${effortLabel(s.effort)}（このモデルでは使えません）` : effortLabel(s.effort) }]
      : []),
  ];

  // 「自動」が今どれに当たるかは、選択肢の名前ではなくここで示す
  const autoNote = !s.model && defaultModel
    ? `「自動」では現在 ${defaultModel.displayName}${!s.effort && defaultModel.defaultEffort ? `（${effortLabel(defaultModel.defaultEffort)}）` : " "}が使われ、Codex の更新に合わせて切り替わります。`
    : !s.effort && current?.defaultEffort
      ? `思考の深さは「自動」なので、このモデルの既定（${effortLabel(current.defaultEffort)}）を使います。`
      : "";

  const modelNote = !state.codex.bundled
    ? "この端末では Codex を実行できません（arm64 のみ対応）。"
    : !state.loggedIn
      ? "ChatGPTにログインすると、使えるモデルが表示されます。"
      : codex.error
        ? `モデルの一覧を取得できませんでした: ${codex.error}`
        : !models
          ? "モデルの一覧を取得しています…"
          : pinnedMissing
            ? "選んでいたモデルは現在使えないため、「自動」で実行します。"
            : autoNote + "決算資料の読解には深めの設定が向きますが、利用枠の消費も増えます。";

  const upd = state.codex.update;
  const latest = codex.available || upd.latest;
  const newer = !!latest && !!upd.active && newerThan(latest, upd.active);
  const pct = download && download.total > 0 ? Math.round((download.done / download.total) * 100) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="設定">
        <div className="space-y-4 pb-2">
          <Card className="p-3.5">
            <span className="eyebrow">ChatGPT</span>
            <p className="mt-1 text-[12.5px] text-ore">
              {state.loggedIn
                ? codex.account?.email
                  ? `${codex.account.email}${codex.account.planType && planName(codex.account.planType) ? `（${planName(codex.account.planType)}）` : ""}でログイン中。ChatGPT の利用枠で分析を実行します。`
                  : "ログイン中。ChatGPT の利用枠で分析を実行します。"
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
                  value={s.model || AUTO}
                  // モデルを変えたら深さはそのモデルのデフォルトに戻す（モデルごとに選べる段階が違う）
                  onValueChange={(v) => save({ model: v === AUTO ? "" : v, effort: "" })}
                  options={modelOptions}
                  className="min-w-0 max-w-[62%]"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px]">思考の深さ</span>
                <Select
                  value={s.effort || AUTO}
                  onValueChange={(v) => save({ effort: v === AUTO ? "" : v })}
                  options={effortOptions}
                  className="min-w-0 max-w-[62%]"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ore">{modelNote}</p>
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

          {state.codex.bundled && (
            <Card className="p-3.5">
              <span className="eyebrow">Codex</span>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="fig text-[13.5px]">v{upd.active}</span>
                  <p className="text-[11px] text-ore">
                    {upd.active === upd.bundled ? "アプリ同梱版" : `更新済み（同梱版 v${upd.bundled}）`}
                  </p>
                </div>
                {newer ? (
                  <Button size="sm" onClick={onUpdate} disabled={!!download}>v{latest} に更新</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={onCheckUpdate} disabled={codex.checking || !!download}>
                    {codex.checking ? "確認中…" : "更新を確認"}
                  </Button>
                )}
              </div>
              {download && (
                <div className="mt-2.5">
                  <div className="h-1 overflow-hidden rounded-full bg-vein">
                    <div className="h-full bg-bullion transition-[width]" style={{ width: `${pct ?? 8}%` }} />
                  </div>
                  <p className="fig mt-1 text-[11px] text-ore">
                    v{download.version} をダウンロード中{pct !== null ? ` ${pct}%` : ""}
                  </p>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[12.5px]">自動更新</span>
                <Select
                  value={s.codexAutoUpdate}
                  onValueChange={(v) => save({ codexAutoUpdate: v as typeof s.codexAutoUpdate })}
                  options={[
                    { value: "wifi", label: "Wi-Fiのみ" },
                    { value: "always", label: "常に" },
                    { value: "off", label: "しない" },
                  ]}
                  className="min-w-[110px]"
                />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ore">
                新しいモデルは、対応した版の Codex でないと一覧に出ません。
              </p>
            </Card>
          )}

          <Card className="p-3.5">
            <span className="eyebrow">このアプリについて</span>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ore">
              価格・金利・原油は公開データから端末内で計算し、採掘コストや現地の動向は
              ChatGPT の利用枠で調べます。データはすべて端末内に保存され、
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
