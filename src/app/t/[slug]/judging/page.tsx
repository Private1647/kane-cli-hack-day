import type { Metadata } from "next";
import Judges from "@/components/home/Judges";
import JudgingTeaser from "@/components/home/JudgingTeaser";
import JudgingBody from "@/components/hub/JudgingBody";
import Hub from "../hub";

export const metadata: Metadata = { title: "Judging" };

export default function JudgingTab({ params }: PageProps<"/t/[slug]/judging">) {
  return (
    <Hub params={params} tab="judging">
      {() => (
        <>
          <JudgingTeaser />
          <JudgingBody />
          <Judges />
        </>
      )}
    </Hub>
  );
}
