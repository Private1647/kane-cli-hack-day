import Section from "./Section";
import { schedule } from "@/data/hackathon";

export default function Schedule() {
  return (
    <Section
      id="schedule"
      eyebrow="Schedule"
      title="Three days, start to ship"
      subtitle="All times are IST. Online participants can follow every session on the live stream."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {schedule.map((day) => (
          <div key={day.day} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h3 className="font-semibold">{day.day}</h3>
            <ul className="mt-4 space-y-3">
              {day.items.map((item) => (
                <li key={item.time + item.title} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 font-mono text-zinc-500">{item.time}</span>
                  <span className="text-zinc-300">{item.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
