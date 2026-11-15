import type { Route } from "@app/client";
import type { Route as NextRoute } from "next";

/** How the web spells each platform-neutral route. */
export function hrefFor(route: Route): NextRoute {
  switch (route.to) {
    case "home":
      return "/";
    case "courses":
      return "/courses";
    case "newCourse":
      return "/courses/new";
    case "course":
      return `/courses/${route.courseId}` as NextRoute;
    case "importWords":
      return `/courses/${route.courseId}/import` as NextRoute;
    case "words":
      return `/courses/${route.courseId}/words` as NextRoute;
    case "study":
      return `/courses/${route.courseId}/study?mode=${route.mode}` as NextRoute;
    case "reviewAll":
      return "/review";
    case "settings":
      return "/settings";
    case "stats":
      return "/stats";
  }
}
