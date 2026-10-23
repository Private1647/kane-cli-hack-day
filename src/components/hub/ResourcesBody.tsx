import SmartLink from "@/components/ui/SmartLink";
import Reveal from "@/components/ui/Reveal";
import { resources } from "@/data/hackday";

// Everything attendees reach for during the day, grouped by when they'll need it.
export default function ResourcesBody() {
  return (
    <div className="container-page grid gap-12 py-16 lg:grid-cols-[14rem_minmax(0,1fr)]">
      {/* Sticky table of contents on wide screens. */}
      <nav aria-label="Resource groups" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
        <ol className="space-y-2 border-l border-hairline">
          {resources.map((g, i) => (
            <li key={g.id}>
              <a href={`#${g.id}`} className="-ml-px block border-l border-transparent pl-4 font-plex text-sm text-lightgray hover:border-lime hover:text-bright">
                {String(i + 1).padStart(2, "0")} {g.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-20">
        {resources.map((g, i) => (
          <Reveal as="section" key={g.id}>
            <span id={g.id} className="block scroll-mt-24" />
            <p className="font-pixel text-xs uppercase tracking-[0.25em] text-lightgray">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-2 font-dots text-4xl leading-none font-black text-bright sm:text-5xl">{g.title}</h2>
            <p className="mt-3 font-plex text-sm text-lightgray">{g.blurb}</p>
            <ul className="mt-8 grid gap-px border border-dashed border-hairline bg-hairline sm:grid-cols-2">
              {g.items.map((it, j) => {
                const body = (
                  <>
                    <span className="font-display text-lg text-bright">{it.label}</span>
                    {it.body && <span className="mt-1 block font-plex text-sm leading-relaxed text-lightgray">{it.body}</span>}
                    {it.href && <span className="mt-3 block font-plex text-xs text-lightgray group-hover:text-lime">Open →</span>}
                  </>
                );
                return (
                  <li key={`${it.label}-${j}`} className="bg-ink sm:odd:last:col-span-2">
                    {it.href ? (
                      <SmartLink href={it.href} className="group block h-full p-5 transition-colors hover:bg-surface">
                        {body}
                      </SmartLink>
                    ) : (
                      <div className="h-full p-5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
