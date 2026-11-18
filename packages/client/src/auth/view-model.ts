import type { AuthScreenState } from "./controller.ts";

export interface SignInVM {
  title: string;
  description: string;
  /** Both continue through Auth0's sign-in page. */
  google: { label: string; disabled: boolean };
  email: { label: string; disabled: boolean };
  /** Why the last sign-in failed or the session ended. */
  error: string | null;
}

export function signInViewModel({ auth, pending }: AuthScreenState): SignInVM {
  return {
    title: "Sign in",
    description:
      "SRS is invite-only for now. Continue with the Google account or the email address you were invited with.",
    google: { label: "Continue with Google", disabled: pending },
    email: { label: "Continue with email and password", disabled: pending },
    error: auth.status === "signedOut" ? auth.error : null,
  };
}
