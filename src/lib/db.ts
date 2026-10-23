import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type QueryResultRow } from "pg";

// bigint ids arrive as strings by default; ours stay far below 2^53, so use numbers.
types.setTypeParser(types.builtins.INT8, Number);

// One pooled connection per function instance; Fluid Compute reuses it across
// requests and attachDatabasePool closes idle clients before suspension.
// Neon's URLs say sslmode=require; spell out verify-full (what pg already does) to silence its warning.
const connectionString = process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full");
const pool = new Pool({ connectionString, max: 5 });
attachDatabasePool(pool);

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

export { pool };
