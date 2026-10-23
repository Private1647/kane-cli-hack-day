import { ImageResponse } from "next/og";
import { socialCard } from "@/components/deck/socialCard";
import { testmuDataUri } from "@/server/deck";
import { getPublishedStory } from "@/server/story";

// OG card for the public deck, 1200×630, in the site style. Published stories only.

export const alt = "Ship Page deck card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublishedStory(slug).catch(() => null);
  if (!page) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#7e7e7e", fontSize: 40 }}>Kane CLI Hack Day</div>,
      size,
    );
  }
  return new ImageResponse(socialCard({ story: page.story, format: "og", testmuDataUri: await testmuDataUri(), draft: false }), size);
}
