import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { api } from "@/lib/native";
import { Button, Sheet, SheetContent } from "./ui";

export interface LoginState {
  phase: "idle" | "browser" | "device";
  verificationUrl?: string;
  userCode?: string;
}

/**
 * ChatGPT へのログイン。実際の認証は同梱の Codex が行う。
 * ブラウザ方式が基本で、戻ってこられない端末向けにコード方式も残す。
 */
export function LoginSheet({
  open, onOpenChange, state, onStart, onCancel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: LoginState;
  onStart: (device: boolean) => void;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!open) setCopied(false); }, [open]);

  const copyAndOpen = () => {
    if (!state.userCode) return;
    api.copy(state.userCode);
    setCopied(true);
    if (state.verificationUrl) api.openUrl(state.verificationUrl);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* AI を使う操作の途中から開くことが多いので、閉じるボタンに自動でフォーカスを当てない */}
      <SheetContent title="ChatGPTでログイン" onOpenAutoFocus={(e) => e.preventDefault()}>
        {state.phase === "idle" && (
          <>
            <p className="text-[12.5px] leading-relaxed text-ore">
              調査と予測は、同梱の公式 Codex があなたの ChatGPT の利用枠で行います。
            </p>
            <Button className="mt-4 w-full" onClick={() => onStart(false)}>ブラウザでログイン</Button>
            <button
              className="mt-1 w-full py-2.5 text-[12px] text-ore underline underline-offset-4 active:text-ink"
              onClick={() => onStart(true)}
            >
              コードでログイン
            </button>
          </>
        )}

        {state.phase === "browser" && (
          <div>
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-vein px-3.5 py-3 text-[12.5px]">
              <span className="pulse h-2 w-2 shrink-0 rounded-full bg-bullion" />
              ブラウザでログインを完了してください
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ore">完了したら、端末の戻るボタンでアプリに戻ってください。</p>
            <Button variant="ghost" className="mt-1 w-full" onClick={onCancel}>キャンセル</Button>
          </div>
        )}

        {state.phase === "device" && (
          <div>
            {state.userCode ? (
              <>
                <p className="text-[11.5px] text-ore">次のページでこのコードを入力してください</p>
                <div className="fig mt-1.5 select-text rounded-xl border border-line bg-vein py-3.5 text-center text-[24px] tracking-[0.14em] text-flux">
                  {state.userCode}
                </div>
                <Button className="mt-2.5 w-full" onClick={copyAndOpen}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  コードをコピーして開く
                  <ExternalLink size={13} className="opacity-60" />
                </Button>
                <p className="mt-2 text-[11px] leading-snug text-ore">
                  ChatGPT の設定（セキュリティ）で、デバイスコード認証の許可が必要な場合があります。
                </p>
              </>
            ) : (
              <p className="fig pulse text-[12px] text-ore">コードを発行しています</p>
            )}
            <div className="mt-3 flex items-center justify-between text-[12px] text-ore">
              <span className="pulse">承認を待っています</span>
              <button className="px-1 py-1 active:text-ink" onClick={onCancel}>キャンセル</button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
