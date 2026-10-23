import Link from "next/link";
import { hubPath } from "@/lib/hub";
import { getTeamSession } from "@/lib/session";
import { getTeamById } from "@/lib/teams";

// Navbar's right-hand side: Log in / Register, or a way back to your team hub.
// Reads the session cookie, so it streams in behind a Suspense boundary.
export default async function Account() {
  let session = null;
  try {
    session = await getTeamSession();
  } catch {
    // A form posted before hydration re-renders the whole page inside the
    // action, where Next.js 16.4 throws on cookies() here. The page still
    // works, so fall back to the signed-out links for that one response.
  }
  const team = session ? await getTeamById(session.teamId) : null;
  return team ? <MyTeam name={team.name} href={hubPath(team.slug)} /> : <SignedOut />;
}

export function SignedOut() {
  return (
    <span className="flex items-center gap-4">
      <Link href="/login" className="font-plex text-sm text-bright transition-colors hover:text-lime">
        Log in
      </Link>
      <Link href="/register" className="bg-bright px-3 py-1.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
        Register
      </Link>
    </span>
  );
}

function MyTeam({ name, href }: { name: string; href: string }) {
  return (
    <Link href={href} className="flex max-w-[16rem] items-center gap-2 bg-bright px-3 py-1.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
      <span className="shrink-0">My team</span>
      <span className="truncate text-ink/60">· {name}</span>
    </Link>
  );
}
