import { event, type Slot } from "@/data/hackday";

/** "13:05" → 785 */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "13:05" → "1:05" (the schedule reads as a single afternoon, no am/pm). */
export const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};

export const slotLabel = (s: Slot) => (s.end ? `${to12h(s.start)}–${to12h(s.end)}` : to12h(s.start));

/** The event-local date and minute of day for a given instant. */
export function inEventZone(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: event.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
