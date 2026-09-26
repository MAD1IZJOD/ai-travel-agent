import Link from "next/link";
import { Compass } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-ink">
            <Compass className="h-5 w-5 text-lagoon" aria-hidden />
            <span className="font-display text-lg font-semibold tracking-tight">Wayfare</span>
          </Link>
          <span className="h-5 w-px bg-line-strong" aria-hidden />
          <p className="flex items-baseline gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-ink-faint">
            A
            <span className="font-display text-base font-normal normal-case italic tracking-normal text-clay">
              Madhavan
            </span>
            product
          </p>
        </div>
        <p className="hidden text-sm text-ink-faint sm:block">Trip planning for India, from six major cities</p>
      </div>
    </header>
  );
}
