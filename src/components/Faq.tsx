import Section from "./Section";
import { faqs } from "@/data/hackathon";

export default function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered">
      <div className="mx-auto max-w-3xl divide-y divide-white/10 rounded-2xl border border-white/10">
        {faqs.map((f) => (
          <details key={f.q} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {f.q}
              <span className="text-zinc-500 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-zinc-400">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
