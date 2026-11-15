/** App chrome: brand and primary navigation (web header, mobile tab bar). */
import type { Route } from "../core/ports.ts";

export interface ShellVM {
  brand: { label: string; route: Route };
  nav: { label: string; route: Route }[];
}

export function shellViewModel(): ShellVM {
  return {
    brand: { label: "SRS", route: { to: "home" } },
    nav: [
      { label: "Home", route: { to: "home" } },
      { label: "Courses", route: { to: "courses" } },
      { label: "Stats", route: { to: "stats" } },
      { label: "Settings", route: { to: "settings" } },
    ],
  };
}
