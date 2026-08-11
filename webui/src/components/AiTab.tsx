import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Trash2 } from "lucide-react";
import type { AppState, Prediction } from "@/lib/native";
import { api, newReqId, on } from "@/lib/native";
import { Badge, Button, Card, Segmented } from "./ui";
import { Markdown } from "./Markdown";
import { PredictionRow } from "./Miners";
import { dateJp } from "@/lib/fmt";

interface ChatMsg { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "今の金の地合いを一言でまとめて",
  "9銘柄のリスクが重複しているところは？",
  "金が2割下がったらどれが一番痛む？",
  "今いちばん割安に見えるのはどれ？なぜ？",
];

export function AiTab({
  state, onPredictionsChange,
}: { state: AppState; onPredictionsChange: (p: Prediction[]) => void }) {
  const [view, setView] = useState<"chat" | "log">("chat");
  return (
    <div className="px-4 pb-6">
      <Segmented
        className="mb-3"
        value={view}
        onChange={setView}
        options={[{ value: "chat", label: "相談" }, { value: "log", label: "予測ログ" }]}
      />
      {view === "chat"
        ? <Chat state={state} />
        : <PredictionLog state={state} onChange={onPredictionsChange} />}
    </div>
  );
}

function Chat({ state }: { state: AppState }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const reqRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offs = [
      on("delta", (p) => {
        if (p.reqId !== reqRef.current) return;
        setTool(null);
        setMsgs((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant") {
            return [...m.slice(0, -1), { ...last, content: last.content + p.text }];
          }
          return [...m, { role: "assistant", content: p.text }];
        });
      }),
      on("tool", (p) => { if (p.reqId === reqRef.current) setTool(p.label); }),
      on("done", (p) => { if (p.reqId === reqRef.current) { setStreaming(false); setTool(null); reqRef.current = null; } }),
      on("error", (p) => {
        if (p.reqId !== reqRef.current) return;
        setStreaming(false); setTool(null); reqRef.current = null;
        setMsgs((m) => [...m, { role: "assistant", content: `取得に失敗しました。${p.message ?? ""}` }]);
      }),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, tool]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    const next: ChatMsg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setInput("");
    setStreaming(true);
    const id = newReqId();
    reqRef.current = id;
    api.chat(id, next);
    api.haptic();
  };

  const stop = () => {
    if (reqRef.current) api.cancel(reqRef.current);
    reqRef.current = null;
    setStreaming(false);
    setTool(null);
  };

  if (!state.loggedIn) {
    return (
      <Card className="p-5 text-center">
        <p className="text-[13px] leading-relaxed text-ore">
          ChatGPTにログインすると、保有銘柄のデータを渡した状態で相談できます。
        </p>
        <Button className="mt-3 w-full" onClick={() => api.login()}>ChatGPTでログイン</Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(var(--vh, 100vh) - 190px)" }}>
      <div className="flex-1 space-y-3">
        {msgs.length === 0 && (
          <Card className="p-4">
            <span className="eyebrow">手元のデータを渡して相談できます</span>
            <div className="mt-2.5 space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-left text-[12.5px] active:bg-vein"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-vein px-3.5 py-2 text-[13.5px]">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="text-[13.5px] leading-relaxed">
              <Markdown>{m.content}</Markdown>
            </div>
          ),
        )}

        {tool && (
          <div className="fig pulse text-[11.5px] text-ore">{tool}</div>
        )}
        {streaming && !tool && msgs[msgs.length - 1]?.role === "user" && (
          <div className="pulse text-[12px] text-ore">考えています…</div>
        )}
        <div ref={endRef} />
      </div>

      <div
        className="sticky z-10 mt-3 flex items-end gap-2 bg-pit pb-2 pt-2"
        style={{ bottom: "calc(var(--kbh, 0px))" }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
          rows={1}
          placeholder="銘柄や地合いについて聞く"
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-vein px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ore/60 focus:border-bullion/50"
        />
        {streaming ? (
          <Button variant="outline" size="icon" onClick={stop}><Square size={14} /></Button>
        ) : (
          <Button size="icon" onClick={() => send(input)} disabled={!input.trim()}>
            <ArrowUp size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * 予測の答え合わせ。
 * これが無いと、それらしい予測を延々と信じ続けることになる。
 */
function PredictionLog({
  state, onChange,
}: { state: AppState; onChange: (p: Prediction[]) => void }) {
  const preds = state.predictions;
  const graded = preds.filter((p) => p.result);
  const hits = graded.filter((p) => p.result!.directionHit).length;
  const inRange = graded.filter((p) => p.result!.inRange).length;

  if (preds.length === 0) {
    return (
      <Card className="p-5 text-center">
        <p className="text-[13px] leading-relaxed text-ore">
          銘柄の詳細から「予測を作る」を選ぶと、3ヶ月後と12ヶ月後の想定がここに記録されます。
          期限が来ると実際の株価と自動で突き合わせます。
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <span className="eyebrow">答え合わせ</span>
        {graded.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] leading-snug text-ore">
            採点済みの予測はまだありません。最初の判定は3ヶ月後です。
          </p>
        ) : (
          <div className="mt-2 flex gap-5">
            <div>
              <span className="fig text-[24px] font-semibold text-bullion">
                {Math.round((hits / graded.length) * 100)}%
              </span>
              <p className="text-[11px] text-ore">方向の的中 ({hits}/{graded.length})</p>
            </div>
            <div>
              <span className="fig text-[24px] font-semibold text-ink">
                {Math.round((inRange / graded.length) * 100)}%
              </span>
              <p className="text-[11px] text-ore">レンジ内 ({inRange}/{graded.length})</p>
            </div>
          </div>
        )}
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] leading-snug text-ore">
          3ヶ月の株価予測はほぼ雑音です。的中率が5割前後に落ち着くなら、それが正常な結果です。
          この数字は予測を疑うために置いています。
        </p>
      </Card>

      {preds.map((p) => (
        <Card key={p.id} className="p-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="disp text-[14px]">{p.ticker}</span>
              <Badge tone="neutral">{dateJp(p.createdAt)}</Badge>
            </span>
            <button
              onClick={() => onChange(api.deletePrediction(p.id))}
              className="p-1 text-ore active:scale-95"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <PredictionRow p={p} />
          {!!p.scenarios?.length && (
            <div className="mt-2 space-y-1">
              {p.scenarios.map((s, i) => (
                <div key={i} className="flex gap-2 text-[11.5px]">
                  <span className={`w-[30px] shrink-0 ${
                    s.case === "bull" ? "text-assay" : s.case === "bear" ? "text-slag" : "text-ore"}`}>
                    {s.case === "bull" ? "強気" : s.case === "bear" ? "弱気" : "基本"}
                  </span>
                  <span className="fig w-[34px] shrink-0 text-ore">{s.probability}%</span>
                  <span className="fig w-[46px] shrink-0">${s.target?.toFixed?.(1) ?? "—"}</span>
                  <span className="flex-1 leading-snug text-ore">{s.trigger}</span>
                </div>
              ))}
            </div>
          )}
          {p.rationale && (
            <p className="mt-2 border-t border-line pt-2 text-[12px] leading-relaxed">{p.rationale}</p>
          )}
          {!!p.watchFor?.length && (
            <div className="mt-2">
              <span className="eyebrow">見直す条件</span>
              {p.watchFor.map((w, i) => (
                <p key={i} className="text-[11.5px] leading-snug text-ore">・{w}</p>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
