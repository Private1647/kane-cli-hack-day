"use client";

import { useSyncExternalStore } from "react";
import { event, schedule, type Slot } from "@/data/hackday";
import { inEventZone, toMinutes } from "./time";

export type DayState =
  | { phase: "before" }
  | { phase: "during"; minutes: number; current: Slot | null; next: Slot | null }
  | { phase: "after" };

function dayState(ms: number): DayState {
  const { date, minutes } = inEventZone(ms);
  if (date < event.date) return { phase: "before" };
  if (date > event.date) return { phase: "after" };
  const starts = schedule.map((s) => toMinutes(s.start));
  const lastEnd = Math.max(...schedule.map((s) => toMinutes(s.end ?? s.start) + 30));
  if (minutes < starts[0]) return { phase: "during", minutes, current: null, next: schedule[0] };
  if (minutes >= lastEnd) return { phase: "after" };
  let current: Slot | null = null;
  for (const s of schedule) if (toMinutes(s.start) <= minutes) current = s;
  const next = schedule.find((s) => toMinutes(s.start) > minutes) ?? null;
  return { phase: "during", minutes, current, next };
}

// Minute-resolution clock shared by every live component.
const subscribe = (cb: () => void) => {
  const id = window.setInterval(cb, 15_000);
  return () => window.clearInterval(id);
};
const getSnapshot = () => Math.floor(Date.now() / 60_000);
const getServerSnapshot = () => null;

/** Where we are in the day, or null while rendering on the server. */
export function useDayState(): DayState | null {
  const minute = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return minute === null ? null : dayState(minute * 60_000);
}
