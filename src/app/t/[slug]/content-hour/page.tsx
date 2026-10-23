import type { Metadata } from "next";
import ContentHourBody from "@/components/hub/ContentHourBody";
import Hub from "../hub";

export const metadata: Metadata = { title: "Content hour" };

export default function ContentHourTab({ params }: PageProps<"/t/[slug]/content-hour">) {
  return (
    <Hub params={params} tab="content-hour">
      {() => <ContentHourBody />}
    </Hub>
  );
}
