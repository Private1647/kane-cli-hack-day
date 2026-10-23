import { judging } from "@/data/hackday";
import { getStaff, hasRole, staffActor } from "@/server/auth";
import { writeAudit } from "@/server/core";
import { getAggregate } from "@/server/judging";

// CSV export of judging for organizers: ?type=summary (one row per
// submission, committed means) or ?type=scores (every judge line, drafts included).

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");

export async function GET(request: Request) {
  const staff = await getStaff();
  if (!hasRole(staff, "organizer")) return new Response("Unauthorized", { status: 401 });
  const type = new URL(request.url).searchParams.get("type") === "scores" ? "scores" : "summary";
  const { rows, lines } = await getAggregate();
  const teams = new Map(rows.map((r) => [r.submission_id, r]));

  const csv =
    type === "summary"
      ? toCsv([
          ["rank", "team", "slug", "project", "receipt", "status", "final_mean", "final_judges", ...judging.rubric.map((r) => `${r.key}_mean`), "stage_mean", "stage_judges", "mid_feedback", "uncommitted_drafts"],
          ...rows.map((r) => [
            r.rank,
            r.team_name,
            r.team_slug,
            r.project_name,
            r.receipt_code,
            r.status,
            r.final.mean,
            r.final.judges,
            ...judging.rubric.map((c) => r.final.categories[c.key]),
            r.stage.mean,
            r.stage.judges,
            r.midFeedback,
            r.drafts,
          ]),
        ])
      : toCsv([
          ["team", "receipt", "judge", "round", "committed", "committed_at", ...judging.rubric.flatMap((r) => [`${r.key}_anchor`, `${r.key}_points`, `${r.key}_evidence`]), "total", "comments", "uncertainty"],
          ...lines.map((l) => [
            teams.get(l.submission_id)?.team_name,
            teams.get(l.submission_id)?.receipt_code,
            l.judge_name,
            l.round,
            l.frozen ? "yes" : "no (draft)",
            l.committed_at ? new Date(l.committed_at).toISOString() : "",
            ...judging.rubric.flatMap((r) => [l.category_scores[r.key]?.anchor, l.category_scores[r.key]?.points, l.category_scores[r.key]?.evidence]),
            l.total,
            l.comments,
            l.uncertainty,
          ]),
        ]);

  await writeAudit(staffActor(staff!), { action: "judging.export", resourceType: "judging", resourceId: type }).catch(() => {});
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="judging-${type}.csv"`,
      "cache-control": "no-store",
    },
  });
}
