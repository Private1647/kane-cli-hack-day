import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import PersonalLoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in to your passport", robots: { index: false } };

// Per-member sign-in. Registered through the team form? Your email plus the
// team password gets you your own passport, no team cookie needed.

export default function PersonalLoginPage({ searchParams }: PageProps<"/passport/login">) {
  return (
    <main>
      <PageHeader eyebrow="Passport" dim="Sign in," bright="Just you." intro="Use the email you registered with and your team password. Lost it? The check-in desk can give you a one-time code." />
      <section className="py-16 sm:py-20">
        <div className="container-page max-w-md space-y-8">
          <Suspense fallback={<PersonalLoginForm next="/passport" />}>
            <WithNext searchParams={searchParams} />
          </Suspense>
          <div className="space-y-2 font-plex text-sm text-lightgray">
            <p>
              Signing in for the whole team?{" "}
              <Link href="/login" className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                Team login
              </Link>
            </p>
            <p>
              Got an activation code?{" "}
              <Link href="/activate" className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                Activate
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

async function WithNext({ searchParams }: Pick<PageProps<"/passport/login">, "searchParams">) {
  const sp = await searchParams;
  const next = sp.next;
  return <PersonalLoginForm next={typeof next === "string" ? next : "/passport"} initialMode={sp.mode === "code" ? "code" : "password"} />;
}
