"use client";
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/app/(app)/admin/actions";

export function ResultMessage({ result, className }: { result: ActionResult | null | undefined; className?: string }) {
  if (!result) return null;
  return (
    <p role="status" className={cn("text-[13px] break-words", result.ok ? "text-ok" : "text-danger", className)}>
      {result.message}
    </p>
  );
}

/** A form bound to a server action with inline success / error feedback. */
export function ActionForm({ action, children, className, submitLabel = "Save", pendingLabel = "Saving…", resetOnSuccess, footer }: { action: (prev: ActionResult | null, f: FormData) => Promise<ActionResult>; children: ReactNode; className?: string; submitLabel?: string; pendingLabel?: string; resetOnSuccess?: boolean; footer?: ReactNode }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {footer}
        <ResultMessage result={state} />
      </div>
    </form>
  );
}

/** A button that runs a server action, optionally after a confirmation step. */
export function ActionButton({ run, children, variant = "secondary", size = "sm", confirm, className, onDone }: { run: () => Promise<ActionResult>; children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"; size?: "sm" | "md"; confirm?: string; className?: string; onDone?: (r: ActionResult) => void }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [asking, setAsking] = useState(false);
  const go = () =>
    start(async () => {
      const r = await run();
      setResult(r);
      setAsking(false);
      onDone?.(r);
    });
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {asking ? (
        <>
          <span className="text-[13px] text-fg-muted">{confirm}</span>
          <Button size={size} variant={variant === "danger" ? "danger" : "primary"} onClick={go} disabled={pending}>{pending ? "Working…" : "Confirm"}</Button>
          <Button size={size} variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
        </>
      ) : (
        <Button size={size} variant={variant} disabled={pending} onClick={() => (confirm ? setAsking(true) : go())}>
          {pending ? "Working…" : children}
        </Button>
      )}
      {result && !result.ok && <ResultMessage result={result} />}
    </span>
  );
}
