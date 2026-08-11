import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-[transform,background-color,box-shadow] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bullion",
  {
    variants: {
      variant: {
        default: "bg-bullion text-pit shadow-[0_8px_22px_rgba(232,176,75,.22)] hover:bg-flux",
        outline: "border border-line bg-vein text-ink hover:border-bullion/50",
        ghost: "text-ink/60 hover:text-ink",
      },
      size: {
        default: "h-12 px-5 text-[15px]",
        lg: "h-14 px-7 text-[16px]",
        sm: "h-10 px-4 text-[14px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLAnchorElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <a ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
