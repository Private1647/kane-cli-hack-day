import type { Metadata } from "next";
import ResourcesBody from "@/components/hub/ResourcesBody";
import Hub from "../hub";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesTab({ params }: PageProps<"/t/[slug]/resources">) {
  return (
    <Hub params={params} tab="resources">
      {() => <ResourcesBody />}
    </Hub>
  );
}
