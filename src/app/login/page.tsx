import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { nextTab } from "@/lib/hub-redirect";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main>
      <PageHeader
        eyebrow="Log in"
        dim="Your team hub,"
        bright="Everything for the day."
        intro="Setup, the brief, resources, submissions and help all live in your team’s hub."
      />
      <section className="py-16 sm:py-20">
        <div className="container-page max-w-md space-y-8">
          <Suspense fallback={<LoginForm next="" />}>
            <WithNext searchParams={searchParams} />
          </Suspense>
          <p className="font-plex text-sm text-lightgray">
            Not registered yet?{" "}
            <Link href="/register" className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
              Register your team
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

async function WithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  return <LoginForm next={nextTab((await searchParams).next)} />;
}
