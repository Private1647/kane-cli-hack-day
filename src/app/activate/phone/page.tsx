import type { Metadata } from "next";
import { Suspense } from "react";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import { Eyebrow } from "@/components/ui/Section";
import { resolvePhoneHandoff } from "@/server/activation";
import { getConsents } from "@/server/passport";
import { shortName } from "@/server/pairing";
import PhoneCamera from "./PhoneCamera";

export const metadata: Metadata = { title: "Take your selfie", robots: { index: false } };

// The phone half of the camera checkpoint (T-ACT-04). Opened from the QR on
// the desktop; the one-time token in the URL is the only credential, so no
// cookie is set and nothing else of the account is reachable from here.

export default function PhonePage({ searchParams }: PageProps<"/activate/phone">) {
  return (
    <main className="py-10 sm:py-16">
      <div className="container-page max-w-lg space-y-6">
        <Eyebrow>Kane Hack Day · Selfie</Eyebrow>
        <Suspense fallback={<p className="font-plex text-sm text-lightgray">Checking your link…</p>}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/activate/phone">, "searchParams">) {
  const token = (await searchParams).token;
  const h = typeof token === "string" ? await resolvePhoneHandoff(token) : null;
  if (!h || typeof token !== "string") {
    return (
      <DegradedServiceAlert state="stale" system="Phone link">
        This link has expired or was already used. On your computer, choose “Use my phone instead” again for a fresh code.
      </DegradedServiceAlert>
    );
  }
  const consents = await getConsents(h.member.id);
  if (!consents.selfie_storage) {
    return (
      <DegradedServiceAlert state="degraded" system="Selfie">
        Selfie storage is switched off for this passport, so there’s nothing to take here. Change it on your computer if you want a photo.
      </DegradedServiceAlert>
    );
  }
  return (
    <div data-checkpoint="awaiting_selfie" className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-bright">Hi {shortName(h.member.display_name ?? h.member.name)}</h1>
      <p className="font-plex text-sm text-lightgray">Press the shutter yourself when you’re ready. The photo goes straight to your private passport and your computer moves on by itself.</p>
      <PhoneCamera token={token} />
    </div>
  );
}
