import { impactIsMeasured, looksLikeMetric, type Story } from "./model";

// The claim/evidence review (T-SHIP-02), pure so the studio editor can run it
// live and the server can re-run it authoritatively on save and publish.
// Each proof claim must bind to one of *this project's* Kane runs or evidence
// artifacts to be "verified"; anything else renders grey, never teal.

export type RunOption = {
  id: string;
  status: string;
  sourceVerified: boolean;
  verificationState: string;
  commitSha: string | null;
  objective: string | null;
  finishedAt: string | null;
};
export type EvidenceOption = { id: string; kind: string; sha: string; verified: boolean; runId: string | null };

export type ReviewState = "verified" | "reported" | "unverified" | "blocked";

export type ProofReview = {
  index: number;
  claim: string;
  requested: Story["proof"][number]["confidence"];
  state: ReviewState;
  /** Plain-words reason, shown in the review table. */
  note: string;
  blocking: boolean;
};

export type ImpactReview = { index: number; claim: string; measured: boolean; note: string };

export type StoryReview = {
  proof: ProofReview[];
  impact: ImpactReview[];
  /** Must be fixed before saving (forged/unsupported verified claims, unknown ids). */
  saveErrors: string[];
  /** Must be fixed before publishing. */
  publishBlockers: string[];
  warnings: string[];
};

/** Pure review against the project's actual runs and evidence. */
export function reviewStory(story: Story, src: { runs: RunOption[]; evidence: EvidenceOption[] }): StoryReview {
  const runs = new Map(src.runs.map((r) => [r.id, r]));
  const ev = new Map(src.evidence.map((e) => [e.id, e]));
  const saveErrors: string[] = [];
  const publishBlockers: string[] = [];
  const warnings: string[] = [];

  const proof = story.proof.map((p, index): ProofReview => {
    const n = index + 1;
    const run = p.run_id ? runs.get(p.run_id) : undefined;
    const art = p.evidence_id ? ev.get(p.evidence_id) : undefined;
    const out = (state: ReviewState, note: string, blocking = false): ProofReview => ({ index, claim: p.claim, requested: p.confidence, state, note, blocking });

    if (p.run_id && !run) {
      saveErrors.push(`Proof ${n}: run ${p.run_id} isn't one of this project's Kane runs.`);
      return out("blocked", `Run ${p.run_id} not found on this project.`, true);
    }
    if (p.evidence_id && !art) {
      saveErrors.push(`Proof ${n}: evidence ${p.evidence_id} isn't one of this project's artifacts.`);
      return out("blocked", `Evidence ${p.evidence_id} not found on this project.`, true);
    }
    if (run && p.commit_sha && run.commitSha && !run.commitSha.startsWith(p.commit_sha.toLowerCase()) && !p.commit_sha.toLowerCase().startsWith(run.commitSha)) {
      warnings.push(`Proof ${n}: commit ${p.commit_sha.slice(0, 10)} differs from the run's commit ${run.commitSha.slice(0, 10)}.`);
    }
    const runBacked = !!run && run.sourceVerified && run.verificationState === "verified";
    const evBacked = !!art && art.verified;

    if (p.confidence === "verified") {
      if (!runBacked && !evBacked) {
        saveErrors.push(`Proof ${n}: "verified" needs a source-verified Kane run or verified evidence. Bind one or mark it participant-reported / unverified.`);
        return out("blocked", "Marked verified but no source-verified run or verified evidence is bound.", true);
      }
      if (run && run.status !== "passed") {
        return out("verified", `Bound to verified run ${run.id} (${run.status}). A failing run is a suspected detection, not a confirmed bug.`);
      }
      return out("verified", runBacked ? `Bound to verified run ${run!.id}.` : `Bound to verified evidence ${art!.id}.`);
    }
    if (looksLikeMetric(p.claim)) {
      publishBlockers.push(`Proof ${n} states a measured result ("${p.claim.slice(0, 40)}…") without verified evidence. Bind a verified run, or reword it without numbers.`);
      return out(p.confidence === "participant_reported" ? "reported" : "unverified", "Reads as a metric but isn't verified: blocks publishing.", true);
    }
    if (p.confidence === "participant_reported") {
      if (!p.source) {
        saveErrors.push(`Proof ${n}: a participant-reported claim needs a source (who observed it, where).`);
        return out("blocked", "Participant-reported needs a source.", true);
      }
      return out("reported", run || art ? "Participant-reported; the bound run/evidence isn't source-verified yet." : "Participant-reported; shown with its source, never as VERIFIED.");
    }
    return out("unverified", "Shown grey as UNVERIFIED.");
  });

  const impact = story.impact.map((i, index): ImpactReview => {
    const measured = impactIsMeasured(i);
    let note = measured ? "Measured: shown with its source and baseline." : "Qualitative: no number is shown.";
    if (i.measure !== null && !measured) {
      note = "Has a number but no source and baseline, so it's shown as qualitative only.";
      warnings.push(`Impact ${index + 1}: the number is hidden until it has both a source and a baseline.`);
    }
    if (!measured && looksLikeMetric(i.claim)) {
      publishBlockers.push(`Impact ${index + 1} puts a number in the claim text without a sourced measure. Move it into Measure with a source and baseline, or remove it.`);
      note = "Number in the claim text without a source: blocks publishing.";
    }
    return { index, claim: i.claim, measured, note };
  });

  if (!story.one_line_pitch) publishBlockers.push("Add a one-line pitch.");
  if (!story.what_we_built) publishBlockers.push("Describe what you built.");
  if (!story.consent_reviewed) publishBlockers.push("Tick “we reviewed consent for everyone credited and pictured” and save.");
  if (story.proof.length === 0) warnings.push("No proof claims yet. The page will say no verified evidence was attached.");
  for (const v of story.visuals) if (!v.approved) warnings.push(`Visual “${v.kind}” isn't approved, so it won't be shown.`);

  return { proof, impact, saveErrors, publishBlockers: [...saveErrors, ...publishBlockers], warnings };
}

