import { redirect } from "next/navigation";

// The hub's old Setup tab: setup lives on /setup now.
export default function SetupTab() {
  redirect("/setup");
}
