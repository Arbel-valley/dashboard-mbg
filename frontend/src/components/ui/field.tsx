import * as React from "react";
import { cn } from "@/lib/utils";

const dasar =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-ink placeholder:text-ink-soft/70 disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(dasar, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(dasar, "pr-8", className)} {...props} />;
}

/** Label + kontrol + teks bantuan dalam satu blok. */
export function Field({
  label,
  htmlFor,
  bantuan,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  bantuan?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {bantuan ? <p className="text-xs text-ink-soft">{bantuan}</p> : null}
    </div>
  );
}

export function Centang({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink", className)}>
      <input type="checkbox" className="size-4 accent-[#4f46e5]" {...props} />
      {label}
    </label>
  );
}
