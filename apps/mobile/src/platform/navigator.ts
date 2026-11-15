/**
 * The Navigator port as an in-memory stack of platform-neutral routes. The
 * minimum the shell needs; a navigation library (Expo Router or React
 * Navigation) replaces it with the full app.
 */
import { createStore, type Navigator, type Route, type Store } from "@app/client";

export interface StackNavigator extends Navigator {
  readonly stack: Store<Route[]>;
  /** Pop the top route. False at the root, so the OS handles back (Android). */
  back(): boolean;
}

/** The shell's destinations (shellViewModel): each starts a fresh stack, like a tab. */
const TABS: ReadonlySet<Route["to"]> = new Set(["home", "courses", "settings"]);

export function createStackNavigator(root: Route = { to: "home" }): StackNavigator {
  const stack = createStore<Route[]>([root]);
  return {
    stack,
    navigate(route) {
      stack.set((routes) => (TABS.has(route.to) ? [route] : [...routes, route]));
    },
    back() {
      const routes = stack.get();
      if (routes.length <= 1) return false;
      stack.set(routes.slice(0, -1));
      return true;
    },
  };
}
