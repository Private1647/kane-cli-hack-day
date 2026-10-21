// Small caption under a statue linking to its numbered credit, e.g. "[ 2 ]".
export default function Caption({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mt-4 font-plex text-xs leading-relaxed text-lightgray">
      <a href={`#mention-${n}`} className="text-bright hover:text-lime">
        [ {n} ]
      </a>{" "}
      {children}
    </p>
  );
}
