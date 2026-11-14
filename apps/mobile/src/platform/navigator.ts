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

export function createStackNavigator(root: Route = { to: "courses" }): StackNavigator {
  const stack = createStore<Route[]>([root]);
  return {
    stack,
    navigate(route) {
      // The root is a tab, not a page on top of the stack.
      stack.set((routes) => (route.to === root.to ? [root] : [...routes, route]));
    },
    back() {
      const routes = stack.get();
      if (routes.length <= 1) return false;
      stack.set(routes.slice(0, -1));
      return true;
    },
  };
}
