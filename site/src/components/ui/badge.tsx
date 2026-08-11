import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "gold",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "gold" | "plain" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium",
        tone === "gold" ? "bg-bullion-soft text-bullion" : "border border-line bg-vein text-ink/60",
        className,
      )}
      {...props}
    />
  );
}
