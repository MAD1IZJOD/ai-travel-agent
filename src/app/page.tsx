import { SiteHeader } from "@/components/SiteHeader";
import { TripPlanner } from "@/components/planner/TripPlanner";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-24 sm:px-6 sm:pt-16">
        <section className="mb-8 max-w-3xl">
          <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Plan a trip that actually fits your budget and pace.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Tell us where you&apos;re starting, what you care about, and how much you want to spend.
          </p>
        </section>
        <TripPlanner />
      </main>
    </>
  );
}
