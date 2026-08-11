import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const REPO = "https://github.com/mokouliszt/Goldras";
export const RELEASES = `${REPO}/releases`;
/** リリースを重ねても貼り替えが要らないよう、常に最新を指す */
export const APK = `${REPO}/releases/latest`;

/** `/Goldras/` 配下に置かれるので、画像はすべて BASE_URL 起点で解決する */
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("px-5 py-20 md:py-28", className)}>
      <div className="mx-auto max-w-content">
        {(eyebrow || title) && (
          <header className="mb-12 md:mb-16">
            {eyebrow && <div className="eyebrow mb-3 text-bullion">{eyebrow}</div>}
            {title && (
              <h2 className="font-disp text-[28px] font-bold leading-[1.35] tracking-tight md:text-[38px]">
                {title}
              </h2>
            )}
            {lead && (
              <p className="mt-4 max-w-2xl text-[15px] leading-[1.9] text-ink/60 md:text-[16px]">{lead}</p>
            )}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

/** 端末の枠に入れたスクリーンショット */
export function Phone({
  src,
  alt,
  className,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("phone w-full max-w-[268px] sm:max-w-[290px]", className)}>
      <img
        src={asset(src)}
        alt={alt}
        width={540}
        height={1062}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="w-full"
      />
    </div>
  );
}

/**
 * アプリの中心にある図。
 * 帯の全長が金1オンスの売値で、左から採掘コストが埋め、残りが利ざやになる。
 * cost はコストが占める割合(%)。
 */
export function CostBar({ cost, thin }: { cost: number; thin?: boolean }) {
  return (
    <div className="costbar">
      <i style={{ width: "100%", background: thin ? "var(--slag)" : "var(--bullion)" }} />
      <i style={{ width: `${cost}%`, background: "rgba(139,129,113,.55)" }} />
    </div>
  );
}
