import type { Metadata } from "next";
import { Suspense } from "react";
import StaffLoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default function StaffLoginPage({ searchParams }: PageProps<"/ops/login">) {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page max-w-md space-y-6">
        <h2 className="font-display text-2xl font-semibold text-bright">Staff sign in</h2>
        <p className="font-plex text-sm text-lightgray">
          Mentors, judges, photographers and organizers. Ask an organizer for a one-time code if you don&apos;t have one.
        </p>
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/ops/login">, "searchParams">) {
  const next = (await searchParams).next;
  return <StaffLoginForm next={typeof next === "string" ? next : "/ops"} />;
}
