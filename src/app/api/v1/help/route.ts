import { envelopeResponse, siteUrl } from "@/server/core";
import { createHelpTicket, listTicketsFor } from "@/server/help";
import { readMutation, requesterFor } from "./request";

// POST /api/v1/help: open a mentor ticket (participant; bearer or member cookie).
// Idempotent on idempotency_key / Idempotency-Key. GET: the caller's tickets.

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const who = await requesterFor(req);
    const out = await createHelpTicket(who, await readMutation(req));
    const { code } = out.ticket;
    return {
      message: out.replayed ? `Ticket ${code} was already opened; same ticket.` : `Ticket ${code} is in the mentor queue. Nobody has claimed it yet.`,
      data: { ...out.ticket, url: siteUrl(out.ticket.url), receipt: out.receipt, replayed: out.replayed },
      warnings: out.warnings,
      uiType: "help_ticket",
      links: [{ label: `Follow ${code}`, url: out.ticket.url }],
      actions: [{ id: "help_get_status", label: "Check ticket status", requires_human_confirmation: false, tool: "help_get_status", href: siteUrl(out.ticket.url) }],
      fallbackText: `Opened ${code} at ${out.receipt.server_time} (server time). Status: open, not yet claimed. Follow it at ${siteUrl(out.ticket.url)}. If the site is down, give ${code} at the help desk.`,
    };
  });
}

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const who = await requesterFor(req);
    const tickets = await listTicketsFor({ memberId: who.member.id, teamId: who.member.team_id });
    const slim = tickets.map((t) => ({ code: t.code, status: t.status, category: t.category, summary: t.summary, mentor: t.mentor, opened_at: t.opened_at, url: siteUrl(t.url) }));
    return {
      message: slim.length ? `${slim.length} ticket(s).` : "No help tickets yet.",
      data: { tickets: slim },
      uiType: "help_ticket_list",
      fallbackText: slim.length ? slim.map((t) => `${t.code} ${t.status}${t.mentor ? ` (${t.mentor})` : ""}: ${t.summary}`).join("\n") : "No help tickets yet.",
    };
  });
}
