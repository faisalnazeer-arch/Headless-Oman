import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // ── Brand variants ───────────────────────────────────────────────
        // Filled crimson gradient — primary CTAs (Add to Cart, Checkout)
        primary: "bg-gradient-brand text-white shadow-md shadow-crimson/25 transition-all duration-200 hover:shadow-lg hover:shadow-crimson/40 hover:brightness-110 active:brightness-95",
        // Transparent with crimson border — secondary CTAs (Quick View, filters)
        secondary: "border border-crimson bg-transparent text-crimson hover:bg-crimson/5 active:bg-crimson/10",
        // White filled with crimson text — used on dark/image backgrounds
        "white-secondary": "border border-white bg-white text-crimson hover:bg-white/90 active:bg-white/80",
        // ── shadcn defaults (kept for compatibility) ─────────────────────
        default: "bg-gradient-brand text-primary-foreground shadow transition-all duration-200 hover:shadow-md hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8 text-sm font-bold uppercase tracking-wide",
        xl: "h-13 rounded-lg px-10 text-base font-bold uppercase tracking-wide",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
