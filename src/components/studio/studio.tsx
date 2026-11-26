"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CaretDown, CaretUp, Lightning, Sliders, SquaresFour, WarningCircle, Sparkle } from "@phosphor-icons/react";
import type { Category } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { Button, EmptyState, Notice, Textarea } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { Viewer } from "@/components/library/viewer";
import { carryValues, defaultValues, FieldInput, settingsSummary } from "./fields";
import { JobCard } from "./job-card";
import { CategoryTabs, ModelInfo, ModelList } from "./model-picker";
import { isActive, type BlockReason, type CharacterOption, type ClientGeneration, type KeyOptions, type PublicModel, type Values } from "./types";

type Estimate =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; usd: number | null; costUnknown: boolean; remainingUsd: number | null }
  | { state: "blocked"; reason: BlockReason; usd: number | null; overridable: boolean }
  | { state: "error"; message: string };

type Props = {
  models: PublicModel[];
  characters: CharacterOption[];
  initialFeed: ClientGeneration[];
  keys: KeyOptions;
  maxUploadMb: number;
  remainingUsd: number | null;
  initial?: { slug: string; values: Values };
  setupHint?: string | null;
};

export function Studio({ models, characters, initialFeed, keys, maxUploadMb, remainingUsd, initial, setupHint }: Props) {
  const reduce = useReducedMotion();
  const bySlug = useMemo(() => new Map(models.map((m) => [m.slug, m])), [models]);
  const firstSlug = initial?.slug && bySlug.has(initial.slug) ? initial.slug : (models.find((m) => m.featured && m.category === "image") ?? models[0])?.slug;
  const [slug, setSlug] = useState<string | undefined>(firstSlug);
  const model = slug ? bySlug.get(slug) : undefined;
  const [category, setCategory] = useState<Category>((model?.category as Category) ?? "image");
  const [values, setValues] = useState<Values>(() => (model ? (initial?.slug === model.slug ? carryValues(model.fields, initial.values) : defaultValues(model.fields)) : {}));
  const [keySource, setKeySource] = useState<"org" | "personal">(keys.org ? "org" : "personal");
  const [feed, setFeed] = useState<ClientGeneration[]>(initialFeed);
  const [estimate, setEstimate] = useState<Estimate>({ state: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ reason: BlockReason; usd: number | null; overridable: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewing, setViewing] = useState<ClientGeneration | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideState, setOverrideState] = useState<"idle" | "busy" | "sent" | string>("idle");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const counts = useMemo(() => models.reduce<Record<string, number>>((a, m) => ((a[m.category] = (a[m.category] ?? 0) + 1), a), {}), [models]);
  const showKeySelector = keys.org && keys.personal && keys.personalAllowed;
  const mainFields = model?.fields.filter((f) => f.group === "main" && f.kind !== "prompt") ?? [];
  const promptField = model?.fields.find((f) => f.kind === "prompt");
  const settingFields = model?.fields.filter((f) => f.group === "settings") ?? [];
  const advancedFields = model?.fields.filter((f) => f.group === "advanced") ?? [];

  const selectModel = (s: string) => {
    const next = bySlug.get(s);
    if (!next) return;
    setSlug(s);
    setValues((v) => carryValues(next.fields, v));
    setFieldErrors({});
    setBlocked(null);
    setSubmitError(null);
    setPickerOpen(false);
  };

  const setValue = (name: string, v: unknown) => {
    setValues((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[name];
      else next[name] = v;
      return next;
    });
    setFieldErrors((e) => {
      if (!e[name]) return e;
      const n = { ...e };
      delete n[name];
      return n;
    });
  };

  // Live cost estimate, refreshed as settings change.
  const estimateReady =
    !!model &&
    !(promptField?.required && !String(values.prompt ?? "").trim()) &&
    !model.fields.some((f) => f.required && f.kind !== "prompt" && (values[f.name] === undefined || (Array.isArray(values[f.name]) && !(values[f.name] as unknown[]).length)));
  useEffect(() => {
    if (!model || !estimateReady) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setEstimate({ state: "loading" });
      try {
        const res = await fetch("/api/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelSlug: model.slug, params: values, keySource }), signal: ctrl.signal });
        const data = await res.json();
        if (data.ok) setEstimate({ state: "ok", usd: data.estimateUsd, costUnknown: data.costUnknown, remainingUsd: data.remainingUsd });
        else if (data.blocked) setEstimate({ state: "blocked", reason: data.blocked, usd: data.estimateUsd, overridable: data.overridable });
        else setEstimate({ state: "error", message: data.error ?? "Couldn't estimate" });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setEstimate({ state: "error", message: "Couldn't reach the server" });
      }
    }, 650);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [model, values, keySource, estimateReady]);
  const shownEstimate: Estimate = estimateReady ? estimate : { state: "idle" };

  // Poll active jobs while the tab is visible.
  const activeIds = feed.filter((g) => isActive(g.status)).map((g) => g.id).join(",");
  useEffect(() => {
    if (!activeIds) return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/generations?ids=${activeIds}`, { cache: "no-store" });
        if (!res.ok) return;
        const { generations } = (await res.json()) as { generations: ClientGeneration[] };
        if (stop) return;
        const map = new Map(generations.map((g) => [g.id, g]));
        setFeed((f) => f.map((g) => map.get(g.id) ?? g));
      } catch {
        // offline; try again next tick
      }
    };
    const t = setInterval(tick, 3500);
    void tick();
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [activeIds]);

  const generate = async () => {
    if (!model) return;
    setSubmitting(true);
    setSubmitError(null);
    setBlocked(null);
    setOverrideState("idle");
    try {
      const res = await fetch("/api/generations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelSlug: model.slug, params: values, keySource }) });
      const data = await res.json();
      if (res.status === 409 && data.blocked) {
        setBlocked({ reason: data.blocked, usd: data.estimateUsd, overridable: data.overridable });
      } else if (data.generation) {
        setFeed((f) => [data.generation, ...f.filter((g) => g.id !== data.generation.id)]);
        if (data.generation.status === "error") setSubmitError(data.generation.error);
        setExpanded(false);
      } else {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        if (data.fieldErrors && Object.keys(data.fieldErrors).some((k) => model.fields.find((f) => f.name === k)?.group !== "main")) setExpanded(true);
        setSubmitError(data.error ?? "Something went wrong.");
      }
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (g: ClientGeneration) => {
    const res = await fetch(`/api/generations/${g.id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (data.generation) setFeed((f) => f.map((x) => (x.id === g.id ? data.generation : x)));
    if (!data.ok && data.error) setSubmitError(data.error);
  };

  const remix = useCallback(
    (g: ClientGeneration) => {
      const m = bySlug.get(g.modelSlug);
      setViewing(null);
      if (!m) {
        setSubmitError(`${g.modelName} is no longer available to you.`);
        return;
      }
      setSlug(m.slug);
      setCategory(m.category as Category);
      setValues(carryValues(m.fields, g.params));
      setFieldErrors({});
      setBlocked(null);
      setTimeout(() => promptRef.current?.focus(), 50);
    },
    [bySlug],
  );

  const favorite = async (g: ClientGeneration) => {
    const res = await fetch(`/api/generations/${g.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: !g.favorite }) });
    const data = await res.json();
    if (data.generation) {
      setFeed((f) => f.map((x) => (x.id === g.id ? data.generation : x)));
      setViewing((v) => (v?.id === g.id ? data.generation : v));
    }
  };

  const requestOverride = async () => {
    if (!model) return;
    setOverrideState("busy");
    const res = await fetch("/api/overrides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelSlug: model.slug, params: values, keySource, note: overrideNote || undefined }) });
    const data = await res.json();
    setOverrideState(res.ok ? "sent" : (data.error ?? "Could not send the request."));
    if (res.ok) setOverrideOpen(false);
  };

  if (!models.length) {
    return (
      <main className="px-4 py-10 lg:px-10">
        <EmptyState icon={<SquaresFour size={28} />} title="No models available to you" body="An admin hasn't enabled any models for your account yet. Ask them to check Admin → Models and your restrictions." action={<Link className="text-accent-text underline" href="/docs">Read how restrictions work</Link>} />
      </main>
    );
  }

  const blockedNow = blocked ?? (shownEstimate.state === "blocked" ? { reason: shownEstimate.reason, usd: shownEstimate.usd, overridable: shownEstimate.overridable } : null);
  const summary = model ? settingsSummary(model.fields, values) : "";
  const canGenerate = !!model && !submitting && !(promptField?.required && !String(values.prompt ?? "").trim());

  return (
    <div className="flex min-h-[calc(100dvh-57px)] lg:h-dvh lg:min-h-0">
      {/* Model panel (desktop) */}
      <aside className="hidden w-[300px] shrink-0 flex-col border-r border-border p-4 lg:flex" aria-label="Model panel">
        <h1 className="mb-3 text-lg font-bold tracking-tight">Studio</h1>
        <div className="mb-3">
          <CategoryTabs value={category} onChange={setCategory} counts={counts} />
        </div>
        <ModelList models={models} category={category} selected={slug ?? ""} onSelect={selectModel} />
      </aside>

      {/* Canvas */}
      <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Canvas">
        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-[calc(var(--composer-h,220px)+96px)] sm:px-6 lg:pt-6 lg:pb-[calc(var(--composer-h,220px)+32px)]">
          {setupHint && <div className="mb-4"><Notice tone="warn" title="Almost ready">{setupHint}</Notice></div>}
          {feed.length === 0 ? (
            <EmptyState icon={<Sparkle size={28} />} title="Your first generation starts here" body="Pick a model, describe what you want and press Generate. Results appear here and in your Library." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence initial={false}>
                {feed.map((g) => (
                  <JobCard key={g.id} g={g} onRemix={remix} onCancel={cancel} onOpen={setViewing} onFavorite={favorite} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Composer, docked at the bottom; a bottom sheet on phones */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 px-2 lg:absolute lg:bottom-0 lg:px-6 lg:pb-5">
          <motion.form
            layout={!reduce}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (canGenerate) void generate();
            }}
            className="glass pointer-events-auto mx-auto max-w-4xl rounded-[16px] p-3 shadow-[var(--shadow)] sm:p-4"
            aria-label="Composer"
          >
            {model && (
              <div className="mb-2.5 flex items-center gap-2">
                <button type="button" onClick={() => setPickerOpen(true)} className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1.5 pr-3 pl-3.5 text-sm font-medium lg:pointer-events-none lg:border-transparent lg:bg-transparent lg:px-0" aria-label={`Model: ${model.name}. Change model`}>
                  <span className="truncate">{model.family}</span>
                  <span className="hidden truncate text-fg-subtle sm:inline">· {model.workflow}</span>
                  <CaretDown size={14} className="shrink-0 lg:hidden" aria-hidden />
                </button>
                <div className="hidden lg:block"><ModelInfo model={model} /></div>
                <div className="ml-auto flex items-center gap-1">
                  {showKeySelector && (
                    <div role="radiogroup" aria-label="Key" className="flex rounded-full border border-border p-0.5 text-[12px]">
                      {(["org", "personal"] as const).map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={keySource === k} onClick={() => setKeySource(k)} className={cn("h-8 rounded-full px-2.5", keySource === k ? "bg-surface-3 text-fg" : "text-fg-muted")}>
                          {k === "org" ? "Org key" : "My key"}
                        </button>
                      ))}
                    </div>
                  )}
                  {(settingFields.length > 0 || advancedFields.length > 0) && (
                    <button type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} aria-controls="composer-settings" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
                      <Sliders size={16} aria-hidden />
                      <span className="mono hidden max-w-[220px] truncate sm:inline">{summary || "Settings"}</span>
                      <span className="sm:hidden">Settings</span>
                      {expanded ? <CaretDown size={14} aria-hidden /> : <CaretUp size={14} aria-hidden />}
                    </button>
                  )}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {expanded && model && (
                <motion.div id="composer-settings" initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 40 }} className="overflow-hidden">
                  <div className="mb-3 max-h-[42dvh] space-y-4 overflow-y-auto border-b border-border pr-1 pb-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {settingFields.map((f) => (
                        <div key={f.name} className={cn(f.kind === "select" && (f.options?.length ?? 0) > 4 && "sm:col-span-2")}>
                          <FieldInput field={f} value={values[f.name]} onChange={(v) => setValue(f.name, v)} error={fieldErrors[f.name]} characters={characters} maxMb={maxUploadMb} keySource={keySource} modelSlug={model.slug} />
                        </div>
                      ))}
                    </div>
                    {advancedFields.length > 0 && (
                      <details className="group">
                        <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg">
                          <CaretDown size={14} className="transition-transform group-open:rotate-180" aria-hidden /> Advanced ({advancedFields.length})
                        </summary>
                        <div className="mt-2 grid gap-4 sm:grid-cols-2">
                          {advancedFields.map((f) => (
                            <div key={f.name} className={cn(f.kind === "json" && "sm:col-span-2")}>
                              <FieldInput field={f} value={values[f.name]} onChange={(v) => setValue(f.name, v)} error={fieldErrors[f.name]} characters={characters} maxMb={maxUploadMb} keySource={keySource} modelSlug={model.slug} />
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {model.notes && (
                      <details>
                        <summary className="cursor-pointer text-[13px] text-fg-subtle hover:text-fg">Model notes from the Higgsfield docs</summary>
                        <div className="mt-2 text-[12px] leading-relaxed whitespace-pre-line text-fg-muted">{model.notes}</div>
                      </details>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {model && mainFields.length > 0 && (
              <div className="scrollbar-none mb-2.5 flex gap-4 overflow-x-auto pb-1">
                {mainFields.map((f) => (
                  <div key={f.name} className={cn("shrink-0", f.kind === "character" && "w-56")}>
                    <FieldInput field={f} value={values[f.name]} onChange={(v) => setValue(f.name, v)} error={fieldErrors[f.name]} characters={characters} maxMb={maxUploadMb} keySource={keySource} modelSlug={model.slug} />
                  </div>
                ))}
              </div>
            )}

            {model && promptField && (
              <div>
                <label htmlFor="prompt" className="sr-only">Prompt</label>
                <Textarea
                  ref={promptRef}
                  id="prompt"
                  rows={2}
                  maxLength={promptField.maxLength}
                  placeholder={model.outputType === "video" ? "Describe the shot, the motion and the mood…" : "Describe what you want to see…"}
                  value={(values.prompt as string) ?? ""}
                  onChange={(e) => setValue("prompt", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) {
                      e.preventDefault();
                      void generate();
                    }
                  }}
                  aria-invalid={!!fieldErrors.prompt}
                  aria-describedby="cost-line"
                  className="max-h-48 min-h-[52px] resize-none border-transparent bg-transparent px-1 text-base focus:border-transparent"
                />
                {fieldErrors.prompt && <p role="alert" className="px-1 text-[13px] text-danger">{fieldErrors.prompt}</p>}
              </div>
            )}

            {(submitError || blockedNow) && (
              <div className="mt-2">
                {blockedNow ? (
                  <Notice
                    tone="warn"
                    title={blockedNow.reason.rule === "monthly_budget" ? "Budget limit reached" : "Blocked by a restriction"}
                    action={
                      blockedNow.overridable && blocked ? (
                        overrideState === "sent" ? <span className="text-sm text-ok">Request sent to admins</span> : <Button size="sm" variant="primary" onClick={() => setOverrideOpen(true)}>Request override</Button>
                      ) : undefined
                    }
                  >
                    {blockedNow.reason.message}
                  </Notice>
                ) : (
                  <Notice tone="danger">{submitError}</Notice>
                )}
              </div>
            )}

            <div className="mt-2 flex items-center gap-3">
              <p id="cost-line" className="min-w-0 flex-1 truncate text-[13px] text-fg-muted" aria-live="polite">
                {shownEstimate.state === "loading" && <span className="mono">Estimating…</span>}
                {shownEstimate.state === "ok" && (
                  <>
                    <span className="mono text-fg">{shownEstimate.costUnknown ? "Cost unknown" : `≈ ${usd(shownEstimate.usd, { precise: true })}`}</span>
                    {shownEstimate.remainingUsd !== null && <span className="mono"> · {usd(Math.max(0, shownEstimate.remainingUsd))} left this month</span>}
                  </>
                )}
                {shownEstimate.state === "idle" && (remainingUsd !== null ? <span className="mono">{usd(Math.max(0, remainingUsd))} left this month</span> : <span>Estimates are shown before you generate</span>)}
                {shownEstimate.state === "blocked" && <span className="text-warn"><WarningCircle size={14} className="mr-1 inline" aria-hidden />Would be blocked</span>}
                {shownEstimate.state === "error" && <span className="text-warn">{shownEstimate.message}</span>}
              </p>
              <Button type="submit" variant="primary" size="md" disabled={!canGenerate} className="shrink-0">
                <Lightning size={18} weight="fill" aria-hidden /> {submitting ? "Sending…" : "Generate"}
              </Button>
            </div>
          </motion.form>
        </div>
      </section>

      {/* Model picker sheet (phones and tablets) */}
      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a model" size="lg">
        <div className="mb-3">
          <CategoryTabs value={category} onChange={setCategory} counts={counts} />
        </div>
        <div className="h-[55dvh]">
          <ModelList models={models} category={category} selected={slug ?? ""} onSelect={selectModel} />
        </div>
      </Dialog>

      <Dialog open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Request a budget override">
        {blocked && (
          <div className="space-y-4">
            <p className="text-[15px] text-fg-muted">{blocked.reason.message}</p>
            <p className="text-[15px]">
              An admin can approve this one job (<span className="mono">{usd(blocked.usd, { precise: true })}</span>), and it will start automatically. Requests expire after 24 hours.
            </p>
            <div>
              <label htmlFor="override-note" className="mb-1.5 block text-sm font-medium">Note for admins <span className="font-normal text-fg-subtle">optional</span></label>
              <Textarea id="override-note" maxLength={500} value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Why this job matters" />
            </div>
            {overrideState !== "idle" && overrideState !== "busy" && overrideState !== "sent" && <Notice tone="danger">{overrideState}</Notice>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={requestOverride} disabled={overrideState === "busy"}>{overrideState === "busy" ? "Sending…" : "Send request"}</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Viewer g={viewing} onClose={() => setViewing(null)} onRemix={remix} onFavorite={favorite} />
    </div>
  );
}
