/** App chrome: brand and primary navigation (web header, mobile tab bar). */
import type { Route } from "../core/ports.ts";

export interface ShellVM {
  brand: { label: string; route: Route };
  nav: { label: string; route: Route }[];
}

export function shellViewModel(): ShellVM {
  return {
    brand: { label: "SRS", route: { to: "courses" } },
    nav: [
      { label: "Courses", route: { to: "courses" } },
      { label: "Settings", route: { to: "settings" } },
    ],
  };
}
