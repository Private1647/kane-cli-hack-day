import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Section";
import { getStaff, hasRole } from "@/server/auth";
import { adminLogout } from "./actions";
import OpsNav from "./OpsNav";
import { OPS_NAV } from "./nav";

// Staff console shell: who is signed in, and the sections their role can open.
// Each page still checks the role itself (requireRole) before reading data.

export const metadata: Metadata = { title: { template: "%s · Ops", default: "Ops" }, robots: { index: false } };

export default function OpsLayout({ children }: LayoutProps<"/ops">) {
  return (
    <div>
      <div className="border-b border-hairline bg-surface">
        <div className="container-page pt-6">
          <Suspense fallback={<OpsBar />}>
            <StaffBar />
          </Suspense>
        </div>
      </div>
      {children}
    </div>
  );
}

async function StaffBar() {
  const staff = await getStaff();
  if (!staff) return <OpsBar />;
  const items = OPS_NAV.filter((i) => hasRole(staff, ...i.roles)).map(({ href, label }) => ({ href, label }));
  return (
    <OpsBar
      who={
        <span className="flex items-center gap-3 font-plex text-xs text-lightgray">
          <span>
            {staff.name} · <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-bright">{staff.role}</span>
          </span>
          <form action={adminLogout}>
            <button type="submit" className="min-h-11 px-1 hover:text-bright">
              Sign out
            </button>
          </form>
        </span>
      }
      nav={<OpsNav items={items} />}
    />
  );
}

function OpsBar({ who, nav }: { who?: ReactNode; nav?: ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <Eyebrow>
          <Link href="/ops" className="hover:text-bright">
            Kane Hack OS · Ops
          </Link>
        </Eyebrow>
        {who}
      </div>
      {nav ?? <div className="h-11" />}
    </>
  );
}
