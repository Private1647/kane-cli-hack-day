// What every admissions-ops server action hands back to its form: a plain
// message plus the receipt (id people can quote + server time), or a
// user-safe error. Shared by the actions (server) and ActionForm (client).

export type OpsState = {
  ok: boolean;
  message: string;
  receipt?: { id: string; server_time: string } | null;
  /** Extra data for the form to show (a preview diff, a one-time code…). */
  data?: unknown;
  /** Field issues from VALIDATION_FAILED. */
  issues?: { path: string; message: string }[];
  /** The form's values, so a failed submit keeps what was typed. */
  values?: Record<string, string>;
} | null;
