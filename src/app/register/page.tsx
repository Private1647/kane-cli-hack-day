import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { challenge, submissions } from "@/data/hackday";
import { to12h } from "@/lib/time";
import { MAX_MEMBERS, isRegistrationOpen } from "@/lib/teams";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Register"
        dim="Solo or squad,"
        bright="Get your page."
        intro={`Register by ${to12h(submissions.team.deadline)}. You get a team page at your own URL where everyone logs progress.`}
      />
      <section className="py-16 sm:py-20">
        <div className="container-page max-w-3xl">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <Registration />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Registration() {
  if (!(await isRegistrationOpen())) {
    return (
      <p className="border-l-2 border-lime pl-4 font-plex text-bright">
        Registration is closed. Find an organizer at the help desk if you still need a team.
      </p>
    );
  }
  return <RegisterForm tracks={challenge.tracks} maxMembers={MAX_MEMBERS} />;
}
