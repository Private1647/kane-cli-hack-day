import { artworks } from "@/data/art";

// Numbered artwork credits, like the footnotes at the end of gradium.ai/phonon.
export default function Mentions() {
  return (
    <section id="mentions" className="scroll-mt-24 border-t border-dashed border-hairline bg-surface py-10">
      <ol className="container-page grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {artworks.map((a) => (
          <li key={a.n} id={`mention-${a.n}`} className="scroll-mt-24 font-plex text-xs leading-relaxed text-lightgray">
            [ {a.n} ]{" "}
            <a href={a.href} target="_blank" rel="noreferrer" className="text-bright underline decoration-hairline underline-offset-2 hover:text-lime">
              {a.title}
            </a>
            . {a.detail} {a.credit}, {a.license}.
          </li>
        ))}
      </ol>
    </section>
  );
}
