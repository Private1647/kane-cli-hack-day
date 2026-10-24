// Client-safe (no server imports), so client components can use it too.

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** A round photo, or the person's initials on a hairline circle. */
export function Avatar({ name, src, size = 36 }: { name: string; src: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- private, cookie-gated image; not for the optimizer
    return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className="rounded-full border border-hairline object-cover" />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex items-center justify-center rounded-full border border-lime bg-lime-deep font-pixel text-[11px] text-lime">
      {initials(name)}
    </span>
  );
}
