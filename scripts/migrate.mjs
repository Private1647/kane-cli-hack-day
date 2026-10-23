// Applies every db/*.sql file in order over the direct (unpooled) connection.
// Each file is idempotent, so re-running is safe.
//   node --env-file=.env.local scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace("sslmode=require", "sslmode=verify-full");
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set; run `vercel env pull` first.");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const dir = new URL("../db/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await client.query(await readFile(new URL(file, dir), "utf8"));
    console.log(`applied ${file}`);
  }
} finally {
  await client.end();
}
