"use client";
import { useSyncExternalStore } from "react";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "dark", "light"];

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function read(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const next = () => {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
    listeners.forEach((fn) => fn());
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Desktop;
  const label = `Theme: ${theme}. Switch theme`;
  return (
    <button type="button" onClick={next} aria-label={label} title={label} className={cn("inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg", className)}>
      <Icon size={20} aria-hidden />
      {withLabel && <span className="text-sm capitalize">{theme}</span>}
    </button>
  );
}
