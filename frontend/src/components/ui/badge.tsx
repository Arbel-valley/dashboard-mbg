import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        netral: "bg-secondary text-ink",
        garis: "border border-line text-ink-soft",
        commit: "bg-aksen-soft text-aksen-teks",
        bahaya: "bg-bahaya-soft text-bahaya",
        gantung: "bg-gantung-soft text-gantung",
        barat: "bg-barat-soft text-barat-teks",
        tengah: "bg-tengah-soft text-tengah-teks",
        timur: "bg-timur-soft text-timur-teks",
      },
    },
    defaultVariants: { variant: "netral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
