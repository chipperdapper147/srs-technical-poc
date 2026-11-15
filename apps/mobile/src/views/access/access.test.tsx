import type { AccessActions, AccessVM } from "@app/client";
import { aCourse, setupFakeApi } from "@app/client/testing";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { mobileTestDeps, renderWithDeps } from "@/test/render";
import { CoursesScreen } from "@/views/courses/courses-screen";
import { AccessScreen } from "./access-screen";
import { AccessView } from "./access-view";

setupFakeApi(() => ({ courses: [aCourse({ title: "Spanish" })], accessKey: "secret" }));

const actions = (): AccessActions => ({
  setDraft: jest.fn(),
  submit: jest.fn(),
  forget: jest.fn(),
});
const locked = (over: Partial<Extract<AccessVM, { kind: "locked" }>> = {}): AccessVM => ({
  kind: "locked",
  title: "Access key",
  description: "This deployment is private for now.",
  field: { id: "access-key", label: "Access key", value: "abc", required: true },
  submit: { label: "Continue", disabled: false },
  error: null,
  ...over,
});

describe("AccessView", () => {
  it("shows the screen when open, with a way to forget a stored key", async () => {
    const a = actions();
    await render(
      <AccessView vm={{ kind: "open", forget: { label: "Forget access key" } }} actions={a}>
        <Text>page</Text>
      </AccessView>,
    );
    expect(screen.getByText("page")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Forget access key" }));
    expect(a.forget).toHaveBeenCalled();
  });

  it("hides the screen and asks for the key when locked", async () => {
    const a = actions();
    await render(
      <AccessView vm={locked()} actions={a}>
        <Text>page</Text>
      </AccessView>,
    );
    expect(screen.queryByText("page")).not.toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Access key" })).toBeOnTheScreen();
    const input = screen.getByLabelText("Access key");
    expect(input).toHaveProp("secureTextEntry", true);
    expect(input).toHaveDisplayValue("abc");
    const user = userEvent.setup();
    await user.type(input, "x");
    expect(a.setDraft).toHaveBeenLastCalledWith("abcx");
    await user.press(screen.getByRole("button", { name: "Continue" }));
    expect(a.submit).toHaveBeenCalled();
  });

  it("disables Continue without a key and says why the last key failed", async () => {
    await render(
      <AccessView
        vm={locked({
          submit: { label: "Continue", disabled: true },
          error: "That key didn't work.",
        })}
        actions={actions()}
      >
        <Text>page</Text>
      </AccessView>,
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("That key didn't work.");
  });
});

describe("AccessScreen", () => {
  it("locks when the API wants a key, then shows the screen once the key is saved", async () => {
    const deps = mobileTestDeps();
    await renderWithDeps(
      <AccessScreen>
        <CoursesScreen />
      </AccessScreen>,
      deps,
    );
    const input = await screen.findByLabelText("Access key");
    const user = userEvent.setup();
    await user.type(input, "secret");
    await user.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("link", { name: /Spanish/ })).toBeOnTheScreen();
    expect(deps.access.header()).toBe("Bearer secret");
  });
});
