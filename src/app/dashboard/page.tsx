import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import Dashboard from "@/components/live/Dashboard";
import { getDashboard } from "@/server/dashboard";

// Public Mission Control dashboard: who is coming in, and how fast the room is
// proving things. Aggregates only. The first frame renders here; Dashboard then
// polls /api/v1/dashboard.

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Kane CLI Hack Day, live: arrivals, Kane runs and proof, as aggregate counts.",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[80] bg-[#0a0d1c]" />}>
      <FirstFrame />
    </Suspense>
  );
}

async function FirstFrame() {
  await connection();
  return <Dashboard initial={await getDashboard()} />;
}
