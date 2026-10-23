"use server";

import { runAction } from "@/server/core";
import { verifyReceipt } from "@/server/submission";

// Read-only: recompute the snapshot hash and check the signature.
export async function verifyAction(code: string) {
  return runAction(() => verifyReceipt(code));
}
