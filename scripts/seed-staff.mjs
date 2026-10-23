// Create or update a staff account and print a one-time login code for /ops/login.
//   node --env-file=.env.local scripts/seed-staff.mjs <email> "<name>" <mentor|photographer|judge|organizer|admin>
// The code is shown once; only its sha256 is stored. Re-run to issue a new code.
// Writes to the database in DATABASE_URL: run it against the right branch.
import { createHash, randomInt } from "node:crypto";
import pg from "pg";

const [email, name, role] = process.argv.slice(2);
const ROLES = ["mentor", "photographer", "judge", "organizer", "admin"];
if (!email || !name || !ROLES.includes(role)) {
  console.error(`usage: seed-staff.mjs <email> "<name>" <${ROLES.join("|")}>`);
  process.exit(1);
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = `${part()}-${part()}`;
const hash = createHash("sha256").update(code.replace(/[^0-9A-Z]/g, "")).digest("hex");

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace("sslmode=require", "sslmode=verify-full");
if (!url) throw new Error("DATABASE_URL is not set");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  const { rows } = await client.query(
    `insert into staff_accounts (email, name, role) values (lower($1), $2, $3)
     on conflict ((lower(email))) do update set name = excluded.name, role = excluded.role, active = true
     returning id`,
    [email.trim(), name.trim(), role],
  );
  const staffId = rows[0].id;
  await client.query("update staff_login_codes set used_at = now() where staff_id = $1 and used_at is null", [staffId]);
  await client.query("insert into staff_login_codes (staff_id, code_hash, expires_at) values ($1, $2, now() + interval '3 days')", [staffId, hash]);
  await client.query(
    `insert into audit_events (actor_type, actor_label, action, resource_type, resource_id) values ('system', 'seed-staff script', 'staff.seed', 'staff_account', $1)`,
    [String(staffId)],
  );
  await client.query("commit");
  console.log(`${role} ${email}: login code ${code} (valid 3 days, single use) at /ops/login`);
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}
