import { NotYet } from "@/platform/not-yet";
import { useCurrentRoute } from "@/platform/providers";
import { CoursesScreen } from "@/views/courses/courses-screen";

/** Routes: the current route in, its screen out (the web's app/ route files). */
export function Router() {
  const route = useCurrentRoute();
  switch (route.to) {
    case "courses":
      return <CoursesScreen />;
    default:
      return <NotYet route={route} />;
  }
}
