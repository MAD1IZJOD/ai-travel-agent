import Link from "next/link";
import { Compass } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Compass className="h-5 w-5 text-lagoon" aria-hidden />
          <span className="font-display text-lg font-semibold tracking-tight">Wayfare</span>
          <span className="rounded-full bg-lagoon/10 px-2.5 py-0.5 text-xs font-medium text-lagoon">
            a Madhavan product
          </span>
        </Link>
        <p className="hidden text-sm text-ink-faint md:block">Trip planning for India, from six major cities</p>
      </div>
    </header>
  );
}
