import type { Metadata } from "next";
import Help from "@/components/home/Help";
import Hub from "../hub";

export const metadata: Metadata = { title: "Help" };

export default function HelpTab({ params }: PageProps<"/t/[slug]/help">) {
  return (
    <Hub params={params} tab="help">
      {() => <Help />}
    </Hub>
  );
}
