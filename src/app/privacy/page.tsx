import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { CONSENT_CATEGORIES, CONSENT_COPY, POLICY_VERSION } from "@/server/passport";

export const metadata: Metadata = {
  title: "Privacy and consent",
  description: "What the Kane CLI Hack Day site stores about you, who can see it, and how to change your mind.",
};

// T-SEC-06: the public privacy and consent page. The consent list is the
// same copy the passport and the paper form use (server/passport.ts), so the
// three never drift apart.

const h2 = "font-display text-2xl tracking-[-0.02em] text-bright sm:text-3xl";
const p = "mt-3 max-w-2xl font-plex text-sm leading-relaxed text-lightgray";

export default function PrivacyPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Privacy"
        dim="Your data,"
        bright="your call."
        intro={<>Policy version {POLICY_VERSION}. Each person decides for themselves; nobody can agree on a teammate&apos;s behalf.</>}
        jumps={[
          { href: "#stored", label: "What we store" },
          { href: "#consent", label: "Your choices" },
          { href: "#public", label: "What is public" },
          { href: "#change", label: "Change or delete" },
        ]}
      />
      <section id="stored" className="scroll-mt-24 py-12">
        <div className="container-page">
          <h2 className={h2}>What we store</h2>
          <ul className="mt-4 max-w-2xl list-none space-y-3 border-t border-dashed border-hairline pt-4 font-plex text-sm text-bright">
            <li>Your registration from the event guest list: name and email. Emails on the imported roster are stored hashed, and encrypted when the organizers have set an encryption key.</li>
            <li>Your team, idea, submission and the Kane run evidence your team uploads. Private idea text stays private to your team and organizers.</li>
            <li>A selfie for your passport, only if you choose to store one. It sits in private storage and is never served publicly unless you also allow photo publication.</li>
            <li>An audit log of changes (who did what, when). It never holds passwords, tokens or full emails.</li>
          </ul>
        </div>
      </section>
      <section id="consent" className="scroll-mt-24 border-t border-dashed border-hairline py-12">
        <div className="container-page">
          <h2 className={h2}>Your choices</h2>
          <p className={p}>Every choice starts off. Each change is recorded as a new entry, so the history shows what you agreed to and when.</p>
          <dl className="mt-6 max-w-3xl divide-y divide-dashed divide-hairline border-y border-dashed border-hairline">
            {CONSENT_CATEGORIES.map((c) => (
              <div key={c} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6">
                <dt className="font-plex text-sm text-bright">{CONSENT_COPY[c].label}</dt>
                <dd className="font-plex text-sm text-lightgray">{CONSENT_COPY[c].description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section id="public" className="scroll-mt-24 border-t border-dashed border-hairline py-12">
        <div className="container-page">
          <h2 className={h2}>What is public</h2>
          <p className={p}>
            A team&apos;s showcase page at /ship/&#123;team&#125; shows what the team submitted. People are named there only if they each said yes, and an @handle only with mention consent. A later &ldquo;no&rdquo; removes the name right away, without a republish.
            Claims show as VERIFIED only when they are backed by a verified Kane run; everything else is labelled as reported by the team.
          </p>
        </div>
      </section>
      <section id="change" className="scroll-mt-24 border-t border-dashed border-hairline py-12">
        <div className="container-page">
          <h2 className={h2}>Change or delete</h2>
          <p className={p}>
            Change any choice on your{" "}
            <Link href="/passport" className="text-bright underline underline-offset-4 hover:text-lime">
              passport
            </Link>{" "}
            at any time. To have your data deleted, or to report a privacy or security problem, ask at the{" "}
            <Link href="/help" className="text-bright underline underline-offset-4 hover:text-lime">
              help desk
            </Link>
            . Security researchers: see /.well-known/security.txt.
          </p>
        </div>
      </section>
    </main>
  );
}
