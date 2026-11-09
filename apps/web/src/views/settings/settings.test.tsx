import { aMe, setupFakeApi } from "@app/client/testing";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { SettingsScreen } from "./settings-screen";

const fake = setupFakeApi(() => ({ me: aMe({ newItemsPerSession: 10 }) }));

describe("SettingsScreen", () => {
  it("saves each setting", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen(<SettingsScreen />);
    await user.selectOptions(await screen.findByLabelText("Answer grading"), "strict");
    await user.click(screen.getByRole("switch", { name: "Require accents" }));
    const n = screen.getByLabelText<HTMLInputElement>("New words per learn session");
    await user.clear(n);
    await user.type(n, "5");
    await user.tab();
    await waitFor(() =>
      expect(fake.current.state.me).toMatchObject({
        gradingMode: "strict",
        accentSensitive: true,
        newItemsPerSession: 5,
      }),
    );
    expect(n.value).toBe("5");
    await expectNoA11yViolations(container);
  });
});
