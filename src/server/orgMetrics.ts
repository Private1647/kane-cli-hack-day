import "server-only";

// TestMu AI (LambdaTest) Insights org metrics for /dashboard: Kane CLI tests and
// credits, test runs by status, bugs, HyperExecute jobs and devices, summed
// over the configured orgs for a trailing window. Server-side only; the API is
// internal. Cached for a minute so the 10s dashboard poll doesn't hammer it.
// Any failure returns null and the section renders "—", never zeros.

const URL_DEFAULT = "https://stage-api.lambdatestinternal.com/insights/api/v3/internal/org-metrics";
const WINDOW_DAYS = 30;
const REVALIDATE_S = 60;

export const RUN_STATUSES = ["Passed", "Failed", "In Progress", "Not Started", "Skipped", "Unknown"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

type Device = string | { name?: string; count?: number; [k: string]: unknown };

type OrgRow = {
  orgId: string;
  kaneCli?: { testsRun?: number; credits?: number };
  automatedTestCases?: number;
  testRuns?: { total?: number; byStatus?: Partial<Record<string, number>> };
  bugsReported?: number;
  hyperexecuteJobs?: number;
  devices?: { desktop?: Device[]; mobile?: Device[] };
};

export type OrgMetrics = {
  orgIds: string[];
  startDate: string;
  endDate: string;
  kaneTestsRun: number;
  kaneCredits: number;
  automatedTestCases: number;
  testRuns: { total: number; byStatus: Record<RunStatus, number> };
  bugsReported: number;
  hyperexecuteJobs: number;
  devices: { desktop: { name: string; count: number | null }[]; mobile: { name: string; count: number | null }[] };
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function deviceList(rows: OrgRow[], kind: "desktop" | "mobile") {
  const out = new Map<string, number | null>();
  for (const r of rows)
    for (const d of r.devices?.[kind] ?? []) {
      const name = typeof d === "string" ? d : String(d.name ?? JSON.stringify(d));
      const count = typeof d === "string" ? null : typeof d.count === "number" ? d.count : null;
      const prev = out.get(name);
      out.set(name, count == null ? (prev ?? null) : (prev ?? 0) + count);
    }
  return [...out].map(([name, count]) => ({ name, count })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

export async function getOrgMetrics(now: Date): Promise<OrgMetrics | null> {
  const orgIds = (process.env.ORG_METRICS_ORG_IDS ?? "160849").split(",").map((s) => s.trim()).filter(Boolean);
  if (!orgIds.length) return null;
  const endDate = day(now);
  const startDate = day(new Date(now.getTime() - WINDOW_DAYS * 86_400_000));
  const token = process.env.ORG_METRICS_TOKEN;

  try {
    const res = await fetch(process.env.ORG_METRICS_URL ?? URL_DEFAULT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify({ orgIds, startDate, endDate }),
      next: { revalidate: REVALIDATE_S },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = ((await res.json()) as { data?: OrgRow[] }).data ?? [];

    const byStatus = Object.fromEntries(RUN_STATUSES.map((s) => [s, 0])) as Record<RunStatus, number>;
    for (const r of rows) for (const s of RUN_STATUSES) byStatus[s] += n(r.testRuns?.byStatus?.[s]);
    const sum = (f: (r: OrgRow) => unknown) => rows.reduce((a, r) => a + n(f(r)), 0);

    return {
      orgIds,
      startDate,
      endDate,
      kaneTestsRun: sum((r) => r.kaneCli?.testsRun),
      kaneCredits: sum((r) => r.kaneCli?.credits),
      automatedTestCases: sum((r) => r.automatedTestCases),
      testRuns: { total: sum((r) => r.testRuns?.total), byStatus },
      bugsReported: sum((r) => r.bugsReported),
      hyperexecuteJobs: sum((r) => r.hyperexecuteJobs),
      devices: { desktop: deviceList(rows, "desktop"), mobile: deviceList(rows, "mobile") },
    };
  } catch (err) {
    console.error("[dashboard] org metrics failed", err);
    return null;
  }
}
