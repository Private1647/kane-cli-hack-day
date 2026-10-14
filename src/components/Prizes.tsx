import Section from "./Section";
import { prizes } from "@/data/hackathon";

export default function Prizes() {
  return (
    <Section
      id="prizes"
      eyebrow="Prizes"
      title="Worth staying up for"
      subtitle="Cash prizes, credits, and introductions to people who can help you keep building after the weekend."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {prizes.map((p, i) => (
          <div
            key={p.place}
            className={`rounded-2xl border p-6 ${
              i === 0
                ? "border-amber-300/40 bg-gradient-to-b from-amber-300/10 to-transparent"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <p className="text-sm text-zinc-400">{p.place}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{p.amount}</p>
            <p className="mt-3 text-sm text-zinc-400">{p.perks}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
