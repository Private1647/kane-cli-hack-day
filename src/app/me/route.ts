import { redirectToHub } from "@/lib/hub-redirect";

// "My team": your own hub, or the login page.
export function GET(request: Request) {
  return redirectToHub(request, "");
}
