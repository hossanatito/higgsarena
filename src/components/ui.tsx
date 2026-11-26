import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover font-semibold disabled:bg-surface-3 disabled:text-fg-subtle disabled:opacity-100",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  outline: "border border-border text-fg hover:bg-surface-2 hover:border-border-strong",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:bg-danger/20 border border-danger/30",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 min-w-9",
  md: "h-11 px-5 text-[15px] gap-2 min-w-11",
  lg: "h-12 px-6 text-base gap-2 min-w-12",
  icon: "h-11 w-11 justify-center",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

const inputBase = "field w-full rounded-[12px] px-3.5 text-[15px] text-fg placeholder:text-fg-subtle transition-[background-color,border-color,box-shadow] duration-150";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "min-h-24 py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputBase, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 256 256%22 fill=%22%23888%22><path d=%22M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z%22/></svg>')]", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-fg", className)} {...props} />;
}

/** Label above the input, hint and error below. Never placeholder-as-label. */
export function Field({ label, htmlFor, hint, error, children, className, optional }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1.5 font-normal text-fg-subtle">optional</span>}
      </Label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] text-fg-subtle">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  accent: "bg-accent-soft text-accent-text border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("panel", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-[10px]", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-fg-muted">{icon}</div>}
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {body && <p className="mt-1.5 max-w-sm text-[15px] text-fg-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "danger" | "ok" }) {
  return (
    <div className="panel p-5">
      <p className="text-[13px] font-medium text-fg-muted">{label}</p>
      <p className={cn("mono mt-2 text-[26px] leading-none font-semibold tracking-tight", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg")}>{value}</p>
      {sub && <p className="mt-1 text-[13px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "danger" | "ok"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const tones = { info: "border-info/30 bg-info-soft", warn: "border-warn/30 bg-warn-soft", danger: "border-danger/30 bg-danger-soft", ok: "border-ok/30 bg-ok-soft" };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-[16px] border p-4 text-[15px]", tones[tone])}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {title && <p className="font-semibold text-fg">{title}</p>}
          {children && <div className={cn("text-fg-muted", title && "mt-0.5")}>{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("panel overflow-x-auto", className)}>
      <table className="data-table w-full min-w-[560px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" className={cn("border-b border-border px-4 py-2.5 text-[12px] font-medium text-fg-subtle first:rounded-tl-[16px] last:rounded-tr-[16px]", className)} {...props}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cn("border-b border-border px-4 py-3 align-middle text-fg [tr:last-child_&]:border-0", className)} {...props}>
      {children}
    </td>
  );
}
