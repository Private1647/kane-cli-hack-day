import { hackathon, sponsors } from "@/data/hackathon";

export default function Register() {
  return (
    <section id="register" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/30 via-fuchsia-600/20 to-transparent p-10 text-center sm:p-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Ready to build?</h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-300">
            Spots are limited. Register your team before applications close and we will send you
            everything you need for kickoff.
          </p>
          <form
            className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            action="#"
            method="post"
          >
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-full border border-white/15 bg-zinc-950/60 px-5 py-3 text-white placeholder:text-zinc-500 focus:border-violet-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-white px-6 py-3 font-medium text-zinc-900 transition hover:bg-zinc-200"
            >
              Register
            </button>
          </form>
          <p className="mt-3 text-xs text-zinc-500">
            {hackathon.dateLabel} · Free to attend
          </p>
        </div>

        <div className="mt-16 text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Backed by</p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-lg font-semibold text-zinc-500">
            {sponsors.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
