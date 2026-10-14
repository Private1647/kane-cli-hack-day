import Section from "./Section";
import { tracks } from "@/data/hackathon";

export default function Tracks() {
  return (
    <Section
      id="tracks"
      eyebrow="Tracks"
      title="Pick your battleground"
      subtitle="Every team chooses one track at kickoff. Track winners get a dedicated prize on top of the overall podium."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {tracks.map((t) => (
          <div
            key={t.title}
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-violet-400/40 hover:bg-white/[0.06]"
          >
            <div className="text-3xl">{t.icon}</div>
            <h3 className="mt-4 text-xl font-semibold">{t.title}</h3>
            <p className="mt-2 text-zinc-400">{t.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
