import type { Route } from "@app/client";
import type { Route as NextRoute } from "next";

/** How the web spells each platform-neutral route. */
export function hrefFor(route: Route): NextRoute {
  switch (route.to) {
    case "courses":
      return "/";
    case "newCourse":
      return "/courses/new";
    case "course":
      return `/courses/${route.courseId}` as NextRoute;
    case "study":
      return `/courses/${route.courseId}/study?mode=${route.mode}` as NextRoute;
    case "settings":
      return "/settings";
  }
}
