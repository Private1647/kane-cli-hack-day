import Countdown from "./Countdown";
import { hackathon } from "@/data/hackathon";

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.25),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:pb-28 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {hackathon.dateLabel} · {hackathon.location}
          </span>

          <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-7xl">
            {hackathon.name}
          </h1>
          <p className="mt-4 bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-2xl font-medium text-transparent sm:text-3xl">
            {hackathon.tagline}
          </p>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">{hackathon.description}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={hackathon.registerUrl}
              className="w-full rounded-full bg-white px-6 py-3 text-center font-medium text-zinc-900 transition hover:bg-zinc-200 sm:w-auto"
            >
              Register now
            </a>
            <a
              href="#tracks"
              className="w-full rounded-full border border-white/15 px-6 py-3 text-center font-medium text-white transition hover:bg-white/10 sm:w-auto"
            >
              Explore tracks
            </a>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-2xl">
          <p className="mb-3 text-center text-xs uppercase tracking-widest text-zinc-500">
            Hacking starts in
          </p>
          <Countdown target={hackathon.startDate} />
        </div>

        <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-6 text-center sm:grid-cols-4">
          {hackathon.stats.map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-zinc-500">{s.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
