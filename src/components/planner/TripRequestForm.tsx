"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { LIMITS } from "@/lib/agent/limits";
import { Button } from "@/components/ui/primitives";

export const EXAMPLE_REQUESTS = [
  "Plan a 6-day trip from Delhi for 2 people under ₹50K, focused on nature and food with a relaxed itinerary.",
  "Long weekend from Mumbai to Goa for 4 friends, ₹60K total, beaches and nightlife, packed.",
  "5 days from Bengaluru for a couple in December, ₹45K, history and food, balanced pace.",
  "A week from Kolkata, solo, ₹25K, mountains and tea gardens, slow and easy.",
];

interface TripRequestFormProps {
  initialText?: string;
  busy: boolean;
  onSubmit: (text: string) => void;
}

export function TripRequestForm({ initialText = "", busy, onSubmit }: TripRequestFormProps) {
  const [text, setText] = useState(initialText);
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const trimmed = text.trim();
  const showEmptyHint = touched && trimmed.length === 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0 || busy) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Describe your trip
      </label>
      <div className="rounded-2xl border border-line-strong bg-surface p-2 shadow-[0_8px_30px_-12px_rgba(29,27,24,0.18)] transition-colors focus-within:border-lagoon">
        <textarea
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) handleSubmit(event);
          }}
          maxLength={LIMITS.requestMaxChars}
          rows={3}
          aria-describedby={hintId}
          placeholder="Plan a relaxed 6-day trip from Delhi for 2 people under ₹50K with great food and nature."
          className="block w-full resize-none bg-transparent px-3 pt-2 text-lg leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-1">
          <p id={hintId} className={showEmptyHint ? "text-sm text-bad" : "text-sm text-ink-faint"}>
            {showEmptyHint
              ? "Describe your trip first — even a rough idea works."
              : "Where from, how long, how many, budget, and what you enjoy."}
          </p>
          <Button type="submit" size="lg" disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Reading" : "Plan my trip"}
            {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-ink-faint uppercase">Try one of these</p>
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {EXAMPLE_REQUESTS.map((example) => (
            <li key={example}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setText(example);
                  onSubmit(example);
                }}
                className="w-full rounded-xl border border-line bg-surface/70 px-3 py-2 text-left text-sm text-ink-soft transition-colors hover:border-line-strong hover:bg-surface hover:text-ink disabled:opacity-60 sm:max-w-[34rem]"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
