"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { addDays, toIsoDate } from "@/lib/agent/dates";
import { LIMITS } from "@/lib/agent/limits";
import { INTERESTS, PACES, type Interest, type TripConstraints } from "@/lib/agent/types";
import { DESTINATIONS, ORIGINS } from "@/lib/data/places";
import { INTEREST_LABELS, PACE_LABELS } from "@/lib/format";
import { Button, cn } from "@/components/ui/primitives";

interface ConstraintFormProps {
  initial: TripConstraints;
  submitLabel: string;
  onSubmit: (constraints: TripConstraints) => void;
  onCancel?: () => void;
  busy?: boolean;
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink focus:border-lagoon focus:outline-none";

function Stepper({ id, value, min, max, onChange, unit }: { id: string; value: number; min: number; max: number; onChange: (v: number) => void; unit: string }) {
  return (
    <div className="flex h-11 items-center rounded-lg border border-line-strong bg-surface">
      <button type="button" aria-label={`Fewer ${unit}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="flex h-full w-11 items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
        className="h-full w-full min-w-0 bg-transparent text-center text-base font-medium text-ink focus:outline-none"
      />
      <button type="button" aria-label={`More ${unit}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="flex h-full w-11 items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function ConstraintForm({ initial, submitLabel, onSubmit, onCancel, busy }: ConstraintFormProps) {
  const [draft, setDraft] = useState<TripConstraints>(initial);
  const [budgetText, setBudgetText] = useState(String(initial.budgetInr));
  const ids = { origin: useId(), destination: useId(), travelers: useId(), days: useId(), budget: useId(), date: useId() };

  const budget = Number(budgetText.replace(/[^\d]/g, ""));
  const budgetError =
    !Number.isFinite(budget) || budget < LIMITS.minBudgetInr
      ? `Enter at least ₹${LIMITS.minBudgetInr.toLocaleString("en-IN")}.`
      : budget > LIMITS.maxBudgetInr
        ? `Keep it under ₹${LIMITS.maxBudgetInr.toLocaleString("en-IN")}.`
        : null;
  const interestsError = draft.interests.length === 0 ? "Pick at least one interest." : null;
  const today = toIsoDate(new Date());
  const hasErrors = Boolean(budgetError || interestsError);

  const update = <K extends keyof TripConstraints>(key: K, value: TripConstraints[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function toggleInterest(interest: Interest) {
    update(
      "interests",
      draft.interests.includes(interest) ? draft.interests.filter((i) => i !== interest) : [...draft.interests, interest],
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (hasErrors) return;
    onSubmit({ ...draft, budgetInr: budget });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starting from" htmlFor={ids.origin}>
          <select id={ids.origin} value={draft.originId} onChange={(e) => update("originId", e.target.value)} className={inputClass}>
            {ORIGINS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destination" htmlFor={ids.destination}>
          <select
            id={ids.destination}
            value={draft.destinationId ?? ""}
            onChange={(e) => update("destinationId", e.target.value || null)}
            className={inputClass}
          >
            <option value="">Pick the best fit for me</option>
            {DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}, {d.region}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Travellers" htmlFor={ids.travelers}>
          <Stepper id={ids.travelers} value={draft.travelers} min={LIMITS.minTravelers} max={LIMITS.maxTravelers} onChange={(v) => update("travelers", v)} unit="travellers" />
        </Field>
        <Field label="Days" htmlFor={ids.days}>
          <Stepper id={ids.days} value={draft.days} min={LIMITS.minDays} max={LIMITS.maxDays} onChange={(v) => update("days", v)} unit="days" />
        </Field>
        <Field label="Total budget (₹)" htmlFor={ids.budget} hint="For the whole group, including travel.">
          <input
            id={ids.budget}
            inputMode="numeric"
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            aria-invalid={Boolean(budgetError)}
            className={cn(inputClass, budgetError && "border-bad")}
          />
          {budgetError && <p className="mt-1 text-xs text-bad">{budgetError}</p>}
        </Field>
        <Field label="Start date" htmlFor={ids.date}>
          <input
            id={ids.date}
            type="date"
            min={addDays(today, 1)}
            max={addDays(today, LIMITS.maxLeadDays)}
            value={draft.startDate}
            onChange={(e) => e.target.value && update("startDate", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">What do you enjoy?</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((interest) => {
            const active = draft.interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                aria-pressed={active}
                onClick={() => toggleInterest(interest)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  active ? "border-lagoon bg-lagoon text-white" : "border-line-strong bg-surface text-ink-soft hover:border-ink-faint hover:text-ink",
                )}
              >
                {INTEREST_LABELS[interest]}
              </button>
            );
          })}
        </div>
        {interestsError && <p className="mt-1 text-xs text-bad">{interestsError}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Pace</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {PACES.map((pace) => {
            const active = draft.pace === pace;
            return (
              <button
                key={pace}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update("pace", pace)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active ? "border-lagoon bg-lagoon-soft" : "border-line-strong bg-surface hover:border-ink-faint",
                )}
              >
                <span className={cn("block text-sm font-semibold", active ? "text-lagoon" : "text-ink")}>{PACE_LABELS[pace].label}</span>
                <span className="block text-xs text-ink-faint">{PACE_LABELS[pace].hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" disabled={hasErrors || busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
