import { redirectToHub } from "@/lib/hub-redirect";

// Lives in the team hub now; see redirectToHub.
export function GET(request: Request) {
  return redirectToHub(request, "content-hour");
}
