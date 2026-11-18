import { describe, expect, it } from "vitest";
import { createAuth, createDevAuth, SESSION_ENDED } from "../core/auth.ts";
import { createCoursesController } from "../courses/controller.ts";
import { shellViewModel } from "../shell/view-model.ts";
import { createFakeAuthSession } from "../testing/auth.ts";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createAuthController } from "./controller.ts";
import { signInViewModel } from "./view-model.ts";

const fake = setupFakeApi(() => ({
  courses: [aCourse({ title: "Spanish" })],
  tokens: ["token-1", "token-2"],
}));

function open(session = createFakeAuthSession()) {
  const deps = createTestDeps(undefined, { auth: createAuth(session) });
  const auth = createAuthController(deps);
  auth.start();
  return { deps, auth, session };
}

const signedIn = (s: { auth: { status: string } }) => s.auth.status === "signedIn";
const signedOut = (s: { auth: { status: string } }) => s.auth.status === "signedOut";
/** Signed out, with nothing under way: ready for the next action. */
const settledOut = (s: { auth: { status: string }; pending: boolean }) =>
  signedOut(s) && !s.pending;

describe("signing in", () => {
  it("shows the sign-in screen, without navigation, when nobody is signed in", async () => {
    const { auth } = open();
    expect(shellViewModel(auth.store.get()).content).toEqual({
      kind: "loading",
      label: "Loading…",
    });
    const s = await waitForState(auth.store, signedOut);
    const vm = shellViewModel(s);
    expect(vm.nav).toEqual([]);
    expect(vm.account).toBeNull();
    expect(vm.content).toEqual({
      kind: "signIn",
      signIn: {
        title: "Sign in",
        description: expect.stringContaining("invite-only"),
        google: { label: "Continue with Google", disabled: false },
        email: { label: "Continue with email and password", disabled: false },
        error: null,
      },
    });
  });

  it("signs in with either method, then shows the shell with the name and the screens", async () => {
    const { auth, session, deps } = open();
    await waitForState(auth.store, signedOut);
    auth.actions.signIn("google");
    expect(signInViewModel(auth.store.get()).google.disabled).toBe(true);
    const s = await waitForState(auth.store, (x) => signedIn(x) && !x.pending);
    expect(session.logins).toEqual(["google"]);
    const vm = shellViewModel(s);
    expect(vm.content).toEqual({ kind: "screen" });
    expect(vm.account).toEqual({
      name: "Ada Lovelace",
      signOut: { label: "Sign out", disabled: false },
    });
    expect(vm.nav.map((n) => n.label)).toEqual(["Home", "Courses", "Catalog", "Stats", "Settings"]);

    const courses = createCoursesController(deps);
    courses.start();
    await waitForState(courses.store, (x) => x.courses.status === "ready");
    expect(fake.current.requests.at(-1)?.authorization).toBe("Bearer token-1");

    auth.actions.signOut();
    await waitForState(auth.store, settledOut);
    auth.actions.signIn("email");
    await waitForState(auth.store, signedIn);
    expect(session.logins).toEqual(["google", "email"]);
  });

  it("restores a session on start", async () => {
    const { auth } = open(createFakeAuthSession({ user: { name: "Grace" } }));
    const s = await waitForState(auth.store, signedIn);
    expect(shellViewModel(s).account?.name).toBe("Grace");
  });

  it("says why when the sign-in redirect comes back refused", async () => {
    const { auth } = open(
      createFakeAuthSession({ restoreError: "You are not on the invite list." }),
    );
    const s = await waitForState(auth.store, signedOut);
    expect(signInViewModel(s).error).toBe("You are not on the invite list.");
  });
});

describe("the access token", () => {
  it("is sent with every request and follows a silent refresh", async () => {
    const session = createFakeAuthSession({ user: { name: "Grace" } });
    const { deps } = open(session);
    await deps.api.courses();
    expect(fake.current.requests.at(-1)?.authorization).toBe("Bearer token-1");
    session.token = "token-2";
    await deps.api.courses();
    expect(fake.current.requests.at(-1)?.authorization).toBe("Bearer token-2");
  });

  it("signs out, saying the session ended, when it can't be renewed", async () => {
    const session = createFakeAuthSession({ user: { name: "Grace" } });
    const { auth, deps } = open(session);
    await waitForState(auth.store, signedIn);
    session.failRenewal();
    await expect(deps.api.courses()).rejects.toThrow("Sign in required.");
    const s = await waitForState(auth.store, signedOut);
    expect(signInViewModel(s).error).toBe(SESSION_ENDED);
  });
});

describe("a 401 from the API", () => {
  it("drops back to signed out and forgets the cached data", async () => {
    const session = createFakeAuthSession({ user: { name: "Grace" } });
    const { auth, deps } = open(session);
    const courses = createCoursesController(deps);
    courses.start();
    await waitForState(courses.store, (x) => x.courses.status === "ready");
    expect(deps.queryClient.getQueryCache().getAll()).not.toHaveLength(0);

    session.token = "revoked";
    await expect(deps.api.me()).rejects.toThrow("Invalid access token");
    const s = await waitForState(auth.store, signedOut);
    expect(shellViewModel(s).content).toMatchObject({ signIn: { error: SESSION_ENDED } });
    expect(deps.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("signing out", () => {
  it("ends the session, clears the cache and shows the sign-in screen without an error", async () => {
    const session = createFakeAuthSession({ user: { name: "Grace" } });
    const { auth, deps } = open(session);
    await waitForState(auth.store, signedIn);
    await deps.api.courses();
    deps.queryClient.setQueryData(["anything"], 1);
    auth.actions.signOut();
    const s = await waitForState(auth.store, settledOut);
    expect(session.logouts).toBe(1);
    expect(deps.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(signInViewModel(s).error).toBeNull();
  });
});

describe("the dev auth port", () => {
  it("is signed in from the start as the local learner, and sends no token", async () => {
    const deps = createTestDeps();
    const auth = createAuthController(deps);
    expect(shellViewModel(auth.store.get()).account?.name).toBe("Local learner");
    auth.start();
    expect(await deps.auth.authorization()).toBeUndefined();
    expect(auth.store.get().auth.status).toBe("signedIn");
  });

  it("signs out and in again in memory", async () => {
    const deps = createTestDeps(undefined, { auth: createDevAuth() });
    const auth = createAuthController(deps);
    auth.start();
    auth.actions.signOut();
    await waitForState(auth.store, settledOut);
    auth.actions.signIn("email");
    const s = await waitForState(auth.store, signedIn);
    expect(shellViewModel(s).account?.name).toBe("Local learner");
  });
});
