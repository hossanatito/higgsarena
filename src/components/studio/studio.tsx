"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, CaretDown, CircleNotch, FilmSlate, ImageSquare, SlidersHorizontal, Sparkle, SquaresFour, UserFocus, WarningCircle } from "@phosphor-icons/react";
import type { Category } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { Button, EmptyState, Notice, Textarea } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { Viewer } from "@/components/library/viewer";
import { carryValues, defaultValues, FieldInput, settingsSummary } from "./fields";
import { JobCard } from "./job-card";
import { CategoryTabs, ModelList } from "./model-picker";
import { SettingsPanel } from "./settings-panel";
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

  const closeSettings = useCallback(() => setExpanded(false), []);
  const resetSettings = () => {
    if (!model) return;
    const defaults = defaultValues(model.fields);
    setValues((prev) => {
      const next: Values = {};
      for (const f of model.fields) {
        if (f.group === "main" && prev[f.name] !== undefined) next[f.name] = prev[f.name];
        else if (defaults[f.name] !== undefined) next[f.name] = defaults[f.name];
      }
      return next;
    });
    setFieldErrors({});
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

  const characterField = mainFields.find((f) => f.kind === "character");
  const mediaFields = mainFields.filter((f) => f.kind !== "character");
  const TypeIcon = model?.outputType === "video" ? FilmSlate : ImageSquare;

  return (
    <div className="flex min-h-[calc(100dvh-57px-var(--demo-h,0px))] lg:h-[calc(100dvh-var(--demo-h,0px))] lg:min-h-0">
      {/* Model panel (desktop) */}
      <aside className="hidden w-[288px] shrink-0 flex-col border-r border-border px-4 pt-5 lg:flex" aria-label="Models">
        <div className="mb-4 flex items-baseline justify-between px-1">
          <h1 className="text-[17px] font-semibold tracking-tight">Studio</h1>
          <span className="mono text-[12px] text-fg-subtle">{models.length} models</span>
        </div>
        <div className="mb-3">
          <CategoryTabs value={category} onChange={setCategory} counts={counts} />
        </div>
        <ModelList models={models} category={category} selected={slug ?? ""} onSelect={selectModel} />
      </aside>

      {/* Canvas */}
      <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Canvas">
        <div className="fade-top flex-1 overflow-y-auto px-3 pt-4 pb-[340px] sm:px-6 lg:pt-6 lg:pb-[260px]">
          {setupHint && <div className="mx-auto mb-4 max-w-[880px]"><Notice tone="warn" title="Almost ready">{setupHint}</Notice></div>}
          {feed.length === 0 ? (
            <div className="mx-auto max-w-md pt-16">
              <EmptyState icon={<Sparkle size={28} />} title="Nothing generated yet" body="Pick a model, describe what you want and press Generate. Results land here and in your Library." />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence initial={false}>
                {feed.map((g) => (
                  <JobCard key={g.id} g={g} onRemix={remix} onCancel={cancel} onOpen={setViewing} onFavorite={favorite} tile />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Cards dissolve into the background behind the composer. */}
        <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-72 bg-gradient-to-t from-bg via-bg/85 to-transparent lg:absolute lg:h-56" />

        {/* Composer: docked on desktop, a bottom sheet above the tab bar on phones */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 px-2 pb-2 lg:absolute lg:bottom-0 lg:px-6 lg:pb-6">
          <motion.form
            layout={!reduce}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (canGenerate) void generate();
            }}
            className="composer pointer-events-auto mx-auto max-w-[880px]"
            aria-label="Composer"
          >
            {model && (
              <SettingsPanel
                open={expanded}
                onClose={closeSettings}
                anchorId="settings-chip"
                modelName={model.name}
                settingFields={settingFields}
                advancedFields={advancedFields}
                notes={model.notes}
                values={values}
                setValue={setValue}
                errors={fieldErrors}
                onReset={resetSettings}
                characters={characters}
                maxMb={maxUploadMb}
                keySource={keySource}
                modelSlug={model.slug}
              />
            )}

            {(submitError || blockedNow) && (
              <div className="px-3 pt-3 sm:px-4">
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

            {model && mediaFields.length > 0 && (
              <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pt-4 sm:px-5">
                {mediaFields.map((f) => (
                  <div key={f.name} className="shrink-0">
                    <FieldInput field={f} value={values[f.name]} onChange={(v) => setValue(f.name, v)} error={fieldErrors[f.name]} characters={characters} maxMb={maxUploadMb} keySource={keySource} modelSlug={model.slug} compact />
                  </div>
                ))}
              </div>
            )}

            {model && promptField && (
              <div className="px-4 pt-3 sm:px-5 sm:pt-4">
                <label htmlFor="prompt" className="sr-only">Prompt</label>
                <textarea
                  ref={promptRef}
                  id="prompt"
                  rows={2}
                  maxLength={promptField.maxLength}
                  placeholder={model.outputType === "video" ? "Describe the shot, the motion and the mood" : "Describe what you want to see"}
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
                  className="prompt-input"
                />
                {fieldErrors.prompt && <p role="alert" className="pb-1 text-[13px] text-danger">{fieldErrors.prompt}</p>}
              </div>
            )}

            <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-2.5 sm:px-3 sm:pb-3">
              <div className="fade-x scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pr-6">
              {model && (
                <button type="button" onClick={() => setPickerOpen(true)} className="chip shrink-0" aria-label={`Model: ${model.name}. Change model`}>
                  <TypeIcon size={16} className="shrink-0 text-accent-text" aria-hidden />
                  <span className="max-w-[180px] truncate">{model.family}</span>
                  <CaretDown size={12} className="shrink-0 text-fg-subtle" aria-hidden />
                </button>
              )}
              {(settingFields.length > 0 || advancedFields.length > 0) && (
                <button id="settings-chip" type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} aria-controls="composer-settings" className={cn("chip shrink-0", expanded && "chip-on")}>
                  <SlidersHorizontal size={16} className="shrink-0" aria-hidden />
                  <span className="mono hidden max-w-[200px] truncate sm:inline">{summary || "Settings"}</span>
                  <span className="sm:hidden">Settings</span>
                </button>
              )}
              {characterField && (
                <label className="chip relative shrink-0">
                  <UserFocus size={16} className="shrink-0" aria-hidden />
                  <span className="sr-only">Character</span>
                  <select
                    value={(values[characterField.name] as string) ?? ""}
                    onChange={(e) => setValue(characterField.name, e.target.value || undefined)}
                    className="max-w-[140px] cursor-pointer appearance-none truncate bg-transparent pr-1 outline-none"
                  >
                    <option value="">No character</option>
                    {characters
                      .filter((c) => c.modelVersion === (/soul-cinema/.test(model!.slug) ? "cinema" : /soul-2/.test(model!.slug) ? "v2" : "v1"))
                      .map((c) => (
                        <option key={c.id} value={c.referenceId}>{c.name}</option>
                      ))}
                  </select>
                </label>
              )}
              {showKeySelector && (
                <div role="radiogroup" aria-label="Key" className="flex h-9 items-center rounded-full bg-surface-2/70 p-0.5 text-[12px]">
                  {(["org", "personal"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={keySource === k} onClick={() => setKeySource(k)} className={cn("h-8 rounded-full px-2.5 transition-colors", keySource === k ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
                      {k === "org" ? "Org key" : "My key"}
                    </button>
                  ))}
                </div>
              )}

              </div>
              <p id="cost-line" className="flex shrink-0 items-center gap-2 px-1.5 text-[13px] text-fg-muted" aria-live="polite">
                {shownEstimate.state === "loading" && <span className="mono text-fg-subtle">Estimating</span>}
                {shownEstimate.state === "ok" && (
                  <>
                    <span className="mono text-fg">{shownEstimate.costUnknown ? "Cost unknown" : `≈ ${usd(shownEstimate.usd, { precise: true })}`}</span>
                    {shownEstimate.remainingUsd !== null && <span className="mono hidden text-fg-subtle md:inline">{usd(Math.max(0, shownEstimate.remainingUsd))} left</span>}
                  </>
                )}
                {shownEstimate.state === "idle" && remainingUsd !== null && <span className="mono hidden text-fg-subtle md:inline">{usd(Math.max(0, remainingUsd))} left this month</span>}
                {shownEstimate.state === "blocked" && <span className="inline-flex items-center gap-1 text-warn"><WarningCircle size={14} aria-hidden />Over budget</span>}
                {shownEstimate.state === "error" && <span className="hidden max-w-[220px] truncate text-warn sm:inline" title={shownEstimate.message}>{shownEstimate.message}</span>}
              </p>
              <button type="submit" disabled={!canGenerate} className="generate-btn" aria-label={submitting ? "Sending" : "Generate"}>
                {submitting ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <ArrowUp size={18} weight="bold" aria-hidden />}
                <span className="hidden sm:inline">{submitting ? "Sending" : "Generate"}</span>
              </button>
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
