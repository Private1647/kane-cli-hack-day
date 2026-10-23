import type { Metadata } from "next";
import { isEnabled } from "@/lib/flags";
import StatusPill from "@/components/ui/StatusPill";
import { VIDEO_SCENES, blankVideoPlan, getVideoPlan } from "@/server/gtm";
import { previewStory } from "@/server/story";
import { Panel } from "../fields";
import Studio, { type StudioCtx } from "../shell";
import VideoEditor from "./VideoEditor";

export const metadata: Metadata = { title: "Video · Ship studio", robots: { index: false } };

// /studio/[slug]/video: the 60-second storyboard (T-VID-01..03).

export default function VideoPage({ params }: PageProps<"/studio/[slug]/video">) {
  return (
    <Studio params={params} tab="video">
      {(ctx) => <VideoTab ctx={ctx} />}
    </Studio>
  );
}

async function VideoTab({ ctx }: { ctx: StudioCtx }) {
  const [saved, preview, automation] = await Promise.all([getVideoPlan(ctx.project.id), previewStory(ctx), isEnabled("video")]);
  const plan = saved?.plan ?? blankVideoPlan(preview.story);

  return (
    <div className="container-page pb-24">
      {/* T-VID-03: the fallback, first, so nobody thinks video is required. */}
      <section className="mt-8 border-l-2 border-hairline pl-4">
        <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">Video is optional</p>
        <p className="mt-2 max-w-2xl font-plex text-sm leading-relaxed text-bright">
          No video? Upload a screen recording, or present the HTML deck. <strong>No penalty.</strong> Your submission is accepted even when media rendering fails.
        </p>
      </section>

      <Panel
        eyebrow="60-second storyboard"
        title="Real footage, honest captions"
        intro="Plan five scenes from your own screen recordings. A Kane evidence pack gives screenshots and logs, not a movie: if you only have stills, use the labelled walkthrough. Never show a green run that didn't happen."
        aside={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusPill tone="unverified">MP4 render · unavailable</StatusPill>
            <p className="max-w-xs font-plex text-xs text-lightgray">
              {automation ? "Automated rendering isn't deployed." : "Video automation is switched off."} Edit the cut yourself from this storyboard and upload the final file.
            </p>
          </div>
        }
      >
        <VideoEditor
          slug={ctx.slug}
          initial={plan}
          initialVersion={saved?.version ?? 0}
          meta={VIDEO_SCENES.map((s) => ({ ...s }))}
          canWrite={ctx.canWrite}
        />
      </Panel>
    </div>
  );
}
