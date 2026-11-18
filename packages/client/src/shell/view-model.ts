/**
 * App chrome: brand, primary navigation (web header, mobile tab bar), the
 * signed-in account, and what the page area shows for the auth state.
 */
import type { AuthScreenState } from "../auth/controller.ts";
import { type SignInVM, signInViewModel } from "../auth/view-model.ts";
import type { Route } from "../core/ports.ts";

export interface ShellVM {
  brand: { label: string; route: Route };
  /** Empty until someone is signed in: every screen needs a session. */
  nav: { label: string; route: Route }[];
  account: { name: string; signOut: { label: string; disabled: boolean } } | null;
  content:
    | { kind: "loading"; label: string }
    | { kind: "screen" }
    | { kind: "signIn"; signIn: SignInVM };
}

const NAV: ShellVM["nav"] = [
  { label: "Home", route: { to: "home" } },
  { label: "Courses", route: { to: "courses" } },
  { label: "Catalog", route: { to: "catalog" } },
  { label: "Stats", route: { to: "stats" } },
  { label: "Settings", route: { to: "settings" } },
];

export function shellViewModel(state: AuthScreenState): ShellVM {
  const brand = { label: "SRS", route: { to: "home" } } as const;
  const { auth, pending } = state;
  switch (auth.status) {
    case "loading":
      return { brand, nav: [], account: null, content: { kind: "loading", label: "Loading…" } };
    case "signedOut":
      return {
        brand,
        nav: [],
        account: null,
        content: { kind: "signIn", signIn: signInViewModel(state) },
      };
    case "signedIn":
      return {
        brand,
        nav: NAV,
        account: { name: auth.user.name, signOut: { label: "Sign out", disabled: pending } },
        content: { kind: "screen" },
      };
  }
}
