import { Suspense, type ComponentProps } from "react";
import { getPersonalMember } from "@/server/auth";
import PageHeader from "./PageHeader";

// A PageHeader that greets the signed-in person by first name once they have a
// profile ("Hi Riya,"). Signed out (or while loading) it shows the plain title.

type Props = ComponentProps<typeof PageHeader> & {
  /** The title for someone we know, given their first name. */
  greet: (first: string) => { dim: string; bright: string };
};

export default function GreetingHeader({ greet, ...props }: Props) {
  return (
    <Suspense fallback={<PageHeader {...props} />}>
      <Greeted greet={greet} {...props} />
    </Suspense>
  );
}

async function Greeted({ greet, ...props }: Props) {
  const m = await getPersonalMember();
  const first = (m?.display_name ?? m?.name ?? "").trim().split(/\s+/)[0];
  if (!first) return <PageHeader {...props} />;
  return <PageHeader {...props} {...greet(first)} />;
}
