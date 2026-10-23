import type { Metadata } from "next";
import Challenge from "@/components/home/Challenge";
import Loop from "@/components/home/Loop";
import Rules from "@/components/home/Rules";
import Schedule from "@/components/home/Schedule";
import Hub from "../hub";

export const metadata: Metadata = { title: "Brief" };

export default function BriefTab({ params }: PageProps<"/t/[slug]/brief">) {
  return (
    <Hub params={params} tab="brief">
      {() => (
        <>
          <Schedule />
          <Challenge />
          <Loop />
          <Rules />
        </>
      )}
    </Hub>
  );
}
