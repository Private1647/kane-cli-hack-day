// Labels for how a roster row was admitted and how its check-in was taken.
// Shared by the check-in desk (client) and the roster table (server).

export const ADMISSION_BASIS_LABEL: Record<string, string> = {
  walk_in_exception: "Staff walk-in exception",
  desk_override: "Organizer override at the desk",
  override: "Signed organizer override",
};

/** Basis null means the roster file admitted them. */
export const admissionLabel = (basis: string | null, source: string) =>
  basis ? (ADMISSION_BASIS_LABEL[basis] ?? basis) : source === "luma_csv" ? "Approved on the Luma roster" : source === "manual_offline" ? "Paper roster" : "Roster";
