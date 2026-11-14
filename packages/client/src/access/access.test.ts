import { describe, expect, it } from "vitest";
import { createCoursesController } from "../courses/controller.ts";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createAccessController } from "./controller.ts";
import { accessViewModel } from "./view-model.ts";

const KEY = "the-right-key";
const fake = setupFakeApi(() => ({ courses: [aCourse()], accessKey: KEY }));

function open(accessKey: string | null = null) {
  const deps = createTestDeps(undefined, { accessKey });
  const access = createAccessController(deps);
  const courses = createCoursesController(deps);
  access.start();
  courses.start();
  return { deps, access, courses };
}

describe("access key", () => {
  it("locks the app when the API asks for a key", async () => {
    const { access } = open();
    const s = await waitForState(access.store, (x) => x.locked);
    expect(accessViewModel(s)).toMatchObject({
      kind: "locked",
      field: { label: "Access key", value: "" },
      submit: { disabled: true },
      error: null,
    });
  });

  it("sends the saved key and refetches what failed", async () => {
    const { access, courses } = open();
    await waitForState(access.store, (x) => x.locked);
    access.actions.setDraft(`  ${KEY}  `);
    access.actions.submit();
    expect(accessViewModel(access.store.get())).toEqual({
      kind: "open",
      forget: { label: "Forget access key" },
    });
    await waitForState(courses.store, (x) => x.courses.status === "ready");
    expect(fake.current.requests.at(-1)?.path).toBe("/courses");
  });

  it("says so when the stored key is rejected, and forgets it", async () => {
    const { access, deps } = open("stale-key");
    const s = await waitForState(access.store, (x) => x.locked);
    expect(accessViewModel(s)).toMatchObject({
      error: "That key didn't work. Check it and try again.",
    });
    expect(deps.access.header()).toBeUndefined();
  });

  it("works without a prompt when the stored key is right", async () => {
    const { access, courses } = open(KEY);
    await waitForState(courses.store, (x) => x.courses.status === "ready");
    expect(access.store.get().locked).toBe(false);
  });

  it("forgets the key on request, which asks for one again", async () => {
    const { access, courses, deps } = open(KEY);
    await waitForState(courses.store, (x) => x.courses.status === "ready");
    access.actions.forget();
    expect(deps.access.header()).toBeUndefined();
    const s = await waitForState(access.store, (x) => x.locked);
    expect(accessViewModel(s)).toMatchObject({ kind: "locked", error: null });
  });
});
