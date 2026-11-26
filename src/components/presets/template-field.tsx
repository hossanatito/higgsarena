"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui";
import { templateVariables } from "@/lib/presets/core";

/** Prompt template editor that shows the {{fields}} members will fill in. */
export function TemplateField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const vars = templateVariables(value);
  return (
    <div>
      <label htmlFor="promptTemplate" className="mb-1.5 block text-sm font-medium">Prompt template</label>
      <Textarea id="promptTemplate" name="promptTemplate" value={value} onChange={(e) => setValue(e.target.value)} maxLength={8000} className="min-h-32 leading-relaxed" placeholder="Studio photo of {{product}} on a seamless backdrop, soft key light" />
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-subtle">
        {vars.length ? (
          <>
            Members fill in:
            {vars.map((v) => (
              <span key={v} className="mono rounded-full bg-accent-soft px-2 py-0.5 text-accent-text">{v}</span>
            ))}
          </>
        ) : (
          <span>Wrap words in double braces, like {"{{product}}"}, to ask members for them.</span>
        )}
      </div>
    </div>
  );
}
