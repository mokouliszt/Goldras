import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Button ---------- */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] transition-[transform,background-color,opacity] active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        default: "bg-bullion text-pit font-semibold",
        outline: "border border-line text-ink bg-transparent",
        subtle: "bg-vein text-ink",
        ghost: "text-ore",
        danger: "border border-slag/50 text-slag bg-transparent",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-8 px-3 text-[12px]",
        lg: "h-13 px-6 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

/* ---------- Card ---------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-seam border border-line", className)} {...props} />;
}

/* ---------- Badge ---------- */

export function Badge({
  className, tone = "neutral", ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "gold" | "good" | "bad" | "copper" }) {
  const tones = {
    neutral: "border-line text-ore",
    gold: "border-bullion/40 text-bullion",
    good: "border-assay/40 text-assay",
    bad: "border-slag/45 text-slag",
    copper: "border-copper/45 text-copper",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-[1px] text-[10px] leading-[1.5] disp tracking-wide uppercase",
        tones[tone], className,
      )}
      {...props}
    />
  );
}

/* ---------- Sheet (下から出るモーダル) ---------- */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title?: string }
>(({ className, children, title, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-2xl border-t border-line bg-seam",
        "focus:outline-none",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="mx-auto h-1 w-9 rounded-full bg-line" />
      </div>
      {title && (
        <div className="flex items-center justify-between px-4 pb-2">
          <DialogPrimitive.Title className="disp text-[17px]">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="rounded-lg p-1.5 text-ore active:scale-95">
            <X size={18} />
          </DialogPrimitive.Close>
        </div>
      )}
      <div
        className="overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+20px)]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

/* ---------- Select ---------- */

export function Select({
  value, onValueChange, options, className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex h-10 items-center justify-between gap-2 rounded-xl border border-line bg-vein px-3 text-[13px] text-ink outline-none",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value />
        </span>
        <ChevronDown size={14} className="shrink-0 text-ore" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[60] max-h-64 overflow-hidden rounded-xl border border-line bg-vein shadow-2xl"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-default select-none items-center rounded-lg py-2 pl-8 pr-3 text-[13px] outline-none data-[highlighted]:bg-seam"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check size={13} className="text-bullion" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ---------- Switch ---------- */

export function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-6 w-11 shrink-0 rounded-full border border-line bg-vein transition-colors data-[state=checked]:bg-bullion/80 data-[state=checked]:border-bullion/60"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-ore transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-pit" />
    </SwitchPrimitive.Root>
  );
}

/* ---------- Segmented ---------- */

export function Segmented<T extends string>({
  value, onChange, options, className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-xl border border-line bg-seam p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[9px] px-2 py-1.5 text-[12px] transition-colors disp tracking-wide",
            value === o.value ? "bg-vein text-bullion" : "text-ore",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Input ---------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-vein px-3 text-[14px] text-ink outline-none",
        "placeholder:text-ore/60 focus:border-bullion/50 transition-colors",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/* ---------- 行 ---------- */

export function Row({
  label, value, sub, tone,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <span className="text-[12.5px] text-ore">{label}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn("fig text-[13.5px]", tone === "good" && "text-assay", tone === "bad" && "text-slag")}
        >
          {value}
        </span>
        {sub && <span className="fig text-[11px] text-ore">{sub}</span>}
      </span>
    </div>
  );
}
