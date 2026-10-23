import { getStaff, hasRole } from "@/server/auth";
import { csvHeaders, toCsv } from "@/server/csv";
import { LEDGERS, reconciliationCsvRows, reconciliationView } from "@/server/recovery";

// The reconciliation view in activity-reconciliation-template.csv columns.
export async function GET() {
  const staff = await getStaff();
  if (!staff || !hasRole(staff, "organizer")) return new Response("Unauthorized", { status: 401 });
  const { rows } = await reconciliationView();
  const csv = toCsv([[...LEDGERS.activity_reconciliation.headers], ...reconciliationCsvRows(rows)]);
  return new Response(csv, { headers: csvHeaders("activity-reconciliation.csv") });
}
