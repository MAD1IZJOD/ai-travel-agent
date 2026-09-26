"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TripConstraints } from "@/lib/agent/types";
import { ConstraintForm } from "./ConstraintForm";

interface ChangeTripDialogProps {
  open: boolean;
  constraints: TripConstraints;
  onClose: () => void;
  onSubmit: (next: TripConstraints) => void;
}

/** Native modal dialog: focus trap, Esc to close and backdrop styling come from the platform. */
export function ChangeTripDialog({ open, constraints, onClose, onSubmit }: ChangeTripDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="change-trip-title"
      onClose={onClose}
      onClick={(event) => {
        // Light dismiss on backdrop click (for browsers without `closedby`).
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[min(40rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-paper px-5 py-4 sm:px-6">
        <div>
          <h2 id="change-trip-title" className="font-display text-2xl text-ink">
            Change your trip
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">We&apos;ll keep what still works and show you exactly what changed.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-faint hover:bg-surface-muted hover:text-ink" aria-label="Close">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="px-5 py-5 sm:px-6">
        {open && <ConstraintForm initial={constraints} submitLabel="Replan my trip" onSubmit={onSubmit} onCancel={onClose} />}
      </div>
    </dialog>
  );
}
