import { NotYet } from "@/platform/not-yet";
import { useCurrentRoute } from "@/platform/providers";
import { CoursesScreen } from "@/views/courses/courses-screen";

/** Routes: the current route in, its screen out (the web's app/ route files). */
export function Router() {
  const route = useCurrentRoute();
  switch (route.to) {
    // The dashboard isn't on mobile yet; until it is, home is the course list.
    case "home":
    case "courses":
      return <CoursesScreen />;
    default:
      return <NotYet route={route} />;
  }
}
