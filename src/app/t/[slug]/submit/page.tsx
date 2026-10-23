import type { Metadata } from "next";
import Deliverables from "@/components/home/Deliverables";
import SubmitBody from "@/components/hub/SubmitBody";
import { hubPath } from "@/lib/hub";
import Hub from "../hub";

export const metadata: Metadata = { title: "Submit" };

export default function SubmitTab({ params }: PageProps<"/t/[slug]/submit">) {
  return (
    <Hub params={params} tab="submit">
      {({ team }) => (
        <>
          <Deliverables />
          <SubmitBody dashboard={hubPath(team.slug)} />
        </>
      )}
    </Hub>
  );
}
