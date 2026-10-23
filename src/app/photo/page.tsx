import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import PageHeader from "@/components/ui/PageHeader";
import { isEnabled } from "@/lib/flags";
import { photoSrc } from "@/lib/photos";
import { getStaff, hasRole } from "@/server/auth";
import { listPhotos } from "@/server/photos";
import Capture from "./Capture";
import { PhotoStatusPill, StaffGate, label } from "./parts";

export const metadata: Metadata = { title: "Photo studio", robots: { index: false } };

// Photographer studio (T-PHOTO-02): capture or upload, then identify people
// by badge scan or lookup. Everything stays private until consent is checked
// and an organizer publishes it.

export default function PhotoStudioPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Photo studio"
        dim="Shoot first,"
        bright="Publish with consent."
        intro="Photos go to private storage. Scan each person's badge (or look them up) so we can check their consent. Face-match suggestions are only suggestions: a person confirms every one."
      />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <StudioView />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function StudioView() {
  const staff = await getStaff();
  if (!hasRole(staff, "photographer", "organizer")) return <StaffGate role="photographer" next="/photo" signedIn={!!staff} />;
  const [on, photos] = await Promise.all([isEnabled("photo_studio"), listPhotos({ photographerId: staff!.role === "photographer" ? staff!.id : null, limit: 60 })]);

  return (
    <div className="space-y-12">
      {on ? (
        <Capture />
      ) : (
        <DegradedServiceAlert state="degraded" system="Photo studio" manualRoute="/ops/media" manualLabel="Media queue">
          Uploads are switched off (flag photo_studio). Keep shooting; use the paper photo & social approval sheet and upload later.
        </DegradedServiceAlert>
      )}

      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className={`${label} mb-3`}>
          {staff!.role === "photographer" ? "Your recent photos" : "Recent photos"} · {photos.length}
        </h2>
        {photos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="border border-hairline bg-surface">
                <Link href={`/photo/${p.id}`} className="block hover:opacity-90">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
                  <img src={photoSrc(p.pathname)!} alt={p.alt_text ?? `Photo ${p.id}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <div className="space-y-1 p-2">
                    <PhotoStatusPill status={p.status} held={!!p.hold_reason && p.status === "identity_review"} />
                    <p className="font-plex text-xs text-lightgray">
                      #{p.id} · {p.team_name ?? "no team"} · {p.people_count} {p.people_count === 1 ? "person" : "people"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-plex text-sm text-lightgray">No photos yet.</p>
        )}
      </section>
    </div>
  );
}
