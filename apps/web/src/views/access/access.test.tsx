import type { AccessActions, AccessVM } from "@app/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccessView } from "./access-view";

const actions = (): AccessActions => ({ setDraft: vi.fn(), submit: vi.fn(), forget: vi.fn() });
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
  it("shows the page when open, with a way to forget a stored key", async () => {
    const a = actions();
    render(
      <AccessView vm={{ kind: "open", forget: { label: "Forget access key" } }} actions={a}>
        page
      </AccessView>,
    );
    expect(screen.getByText("page")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Forget access key" }));
    expect(a.forget).toHaveBeenCalled();
  });

  it("hides the page and asks for the key when locked", async () => {
    const a = actions();
    render(
      <AccessView vm={locked()} actions={a}>
        page
      </AccessView>,
    );
    expect(screen.queryByText("page")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Access key" })).toBeTruthy();
    const input = screen.getByLabelText("Access key");
    expect(input.getAttribute("type")).toBe("password");
    await userEvent.type(input, "x");
    expect(a.setDraft).toHaveBeenLastCalledWith("abcx");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(a.submit).toHaveBeenCalled();
  });

  it("shows why the last key failed", () => {
    render(
      <AccessView vm={locked({ error: "That key didn't work." })} actions={actions()}>
        page
      </AccessView>,
    );
    expect(screen.getByText("That key didn't work.")).toBeTruthy();
  });
});
