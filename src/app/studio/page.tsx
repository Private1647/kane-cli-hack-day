import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { getMember } from "@/server/auth";
import { studioPathFor } from "@/server/story";

export const metadata: Metadata = { title: "Ship studio", robots: { index: false } };

// /studio: sends a signed-in member to their team's studio.

export default function StudioIndex() {
  return (
    <main>
      <PageHeader eyebrow="Ship studio" dim="One story." bright="Every artifact." intro="Your Ship Page, HTML deck, 60-second video plan and launch copy, all from one reviewed story." />
      <Suspense fallback={<p className="container-page py-12 font-plex text-sm text-lightgray">Checking your team…</p>}>
        <Go />
      </Suspense>
    </main>
  );
}

async function Go() {
  const path = await studioPathFor(await getMember());
  if (path) redirect(path);
  return (
    <section className="container-page max-w-xl py-12">
      <p className="font-plex text-sm text-lightgray">Sign in to your team hub first, then open the Studio tab.</p>
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
        Sign in →
      </Link>
    </section>
  );
}
