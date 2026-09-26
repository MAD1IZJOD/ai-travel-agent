import { BadgeCheck, BookOpen, Calculator, Lightbulb } from "lucide-react";
import type { Verification } from "@/lib/agent/types";
import { Badge } from "@/components/ui/primitives";

export const VERIFICATION_COPY: Record<Verification, { label: string; explain: string }> = {
  verified: { label: "Checked live", explain: "Fetched from the named source while building this plan." },
  reference: { label: "From our guide", explain: "From our curated destination notes." },
  estimated: { label: "Estimate", explain: "Worked out from typical prices. Not a quote — check before booking." },
  suggestion: { label: "Our suggestion", explain: "A planning choice we made for you." },
};

const ICONS = { verified: BadgeCheck, reference: BookOpen, estimated: Calculator, suggestion: Lightbulb };
const TONES = { verified: "ok", reference: "neutral", estimated: "warn", suggestion: "lagoon" } as const;

export function SourceLabel({ kind, className }: { kind: Verification; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <Badge tone={TONES[kind]} className={className}>
      <Icon className="h-3 w-3" aria-hidden />
      {VERIFICATION_COPY[kind].label}
    </Badge>
  );
}
