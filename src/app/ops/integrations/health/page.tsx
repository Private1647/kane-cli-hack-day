import { redirect } from "next/navigation";

// DEPLOYMENT §9 names /ops/integrations/health; it's the same page.
export default function IntegrationsHealth() {
  redirect("/ops/integrations");
}
