import type { AuthActions, SignInVM } from "@app/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { SignInView } from "./sign-in-view";

const actions = (): AuthActions => ({ signIn: vi.fn(), signOut: vi.fn() });
const vm = (over: Partial<SignInVM> = {}): SignInVM => ({
  title: "Sign in",
  description: "SRS is invite-only for now.",
  google: { label: "Continue with Google", disabled: false },
  email: { label: "Continue with email and password", disabled: false },
  error: null,
  ...over,
});

describe("SignInView", () => {
  it("offers Google and email and password", async () => {
    const a = actions();
    const { container } = render(<SignInView vm={vm()} actions={a} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("SRS is invite-only for now.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(a.signIn).toHaveBeenLastCalledWith("google");
    await userEvent.click(screen.getByRole("button", { name: "Continue with email and password" }));
    expect(a.signIn).toHaveBeenLastCalledWith("email");
    expect(screen.queryByRole("alert")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("disables both while a sign-in is under way", () => {
    render(
      <SignInView
        vm={vm({
          google: { label: "Continue with Google", disabled: true },
          email: { label: "Continue with email and password", disabled: true },
        })}
        actions={actions()}
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("says why the last sign-in failed or the session ended", () => {
    render(<SignInView vm={vm({ error: "Your session has ended." })} actions={actions()} />);
    expect(screen.getByRole("alert").textContent).toContain("Your session has ended.");
  });
});
