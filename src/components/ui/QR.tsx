import QRCode from "qrcode";

// A scannable QR as inline SVG, rendered on the server (no client JS).
// Always dark modules on a light quiet zone, so phones read it off a black page
// or a TV. Never encode PII: use a URL or a revocable token.
export default async function QR({
  value,
  size = 160,
  label,
  caption,
  className = "",
}: {
  value: string;
  size?: number;
  /** Accessible name, e.g. "QR code: open the help desk". */
  label: string;
  /** Optional text under the code (e.g. the short URL), so it works without a camera. */
  caption?: string;
  className?: string;
}) {
  const svg = await QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#f2f2f2" } });
  return (
    <figure className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <div
        role="img"
        aria-label={label}
        style={{ width: size, height: size }}
        className="bg-card [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption && <figcaption className="max-w-full font-plex text-xs break-all text-lightgray">{caption}</figcaption>}
    </figure>
  );
}
