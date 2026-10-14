import Section from "./Section";

const points = [
  {
    title: "Build with mentors",
    body: "Engineers from top startups roam the floor all weekend. Get unstuck in minutes, not hours.",
  },
  {
    title: "Demo to real judges",
    body: "Founders, investors, and senior engineers watch every finalist pitch live.",
  },
  {
    title: "Leave with momentum",
    body: "Cloud credits, incubation intros, and a community that keeps shipping after Sunday.",
  },
];

export default function About() {
  return (
    <Section
      id="about"
      eyebrow="About"
      title="Not just another weekend"
      subtitle="HackSprint is built for people who would rather ship a rough prototype than polish a slide deck."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h3 className="text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-zinc-400">{p.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
