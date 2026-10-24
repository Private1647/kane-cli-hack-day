// Ingredients for the "Suggest a name" button on the create-team form.
const FIRST = [
  "Green", "Flaky", "Headless", "Async", "Rapid", "Silent", "Atomic", "Lucky", "Midnight", "Pixel", "Turbo", "Quiet",
  "Brave", "Stealth", "Zero-Bug", "Hot", "Cosmic", "Neon", "Sharp", "Steady", "Clever", "Rogue", "Swift", "Golden",
];
const SECOND = [
  "Build", "Selector", "Pipeline", "Assert", "Release", "Merge", "Deploy", "Regression", "Snapshot", "Rollback", "Commit",
  "Sprint", "Agent", "Prompt", "Patch", "Branch", "Signal", "Runner", "Checkpoint", "Payload",
];
const THIRD = ["Crew", "Squad", "Gang", "Club", "Collective", "Brigade", "Lab", "Guild", "Wizards", "Pilots", "Hunters", "Rangers"];

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A random name, different from `previous`. */
export function suggestTeamName(previous = ""): string {
  for (let i = 0; i < 5; i++) {
    const name = `${pick(FIRST)} ${pick(SECOND)} ${pick(THIRD)}`;
    if (name !== previous) return name;
  }
  return `${pick(FIRST)} ${pick(SECOND)} ${pick(THIRD)}`;
}
