import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateBearer } from "@/server/auth";
import { siteUrl, toAppError, toEnvelope } from "@/server/core";
import { assertMcpEnabled, buildMcpServer } from "@/server/mcp";

// /mcp: the event MCP server over Streamable HTTP (stateless, JSON responses).
// Auth: `Authorization: Bearer khk_…` from pairing (`kanehack pair`). Every
// request builds a fresh server bound to that token's member, so nothing is
// shared between participants and no session state lives in the function.
// GET (server-initiated SSE) and DELETE (session end) aren't offered: 405.

function unauthorized(message: string) {
  return Response.json(
    toEnvelope({ status: "error", message, fallbackText: `${message} Pair this machine: kanehack pair (or ${siteUrl("/pair")}).` }),
    { status: 401, headers: { "www-authenticate": `Bearer realm="kaneclihack", error="invalid_token"` } },
  );
}

export async function POST(req: Request) {
  try {
    await assertMcpEnabled();
  } catch (err) {
    const e = toAppError(err);
    return Response.json(toEnvelope({ message: e.userMessage, error: e }), { status: e.status });
  }
  const auth = await authenticateBearer(req);
  if (!auth) return unauthorized("Missing or invalid token.");

  const server = buildMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 3 * 1024 * 1024 });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req, { authInfo: { token: "redacted", clientId: `member:${auth.member.id}`, scopes: auth.scopes } });
  } catch (err) {
    const e = toAppError(err);
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: e.userMessage }, id: null }, { status: 500 });
  } finally {
    // JSON response mode: the reply is complete once handleRequest resolves.
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}

const notOffered = () =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this server is stateless; POST JSON-RPC to /mcp." }, id: null }, { status: 405, headers: { allow: "POST" } });

export const GET = notOffered;
export const DELETE = notOffered;
