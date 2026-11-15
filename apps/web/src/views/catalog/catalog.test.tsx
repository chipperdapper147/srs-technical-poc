import type { CatalogActions, CatalogCardVM, CatalogVM } from "@app/client";
import { aCourse, setupFakeApi } from "@app/client/testing";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { CatalogScreen } from "./catalog-screen";
import { CatalogView } from "./catalog-view";

const card = (overrides: Partial<CatalogCardVM> = {}): CatalogCardVM => ({
  id: "c1",
  title: "World capitals",
  description: "Geography",
  languages: "English for English speakers",
  words: "20 words",
  route: { to: "course", courseId: "c1" },
  copy: { label: "Copy to my courses", disabled: false, error: null },
  ...overrides,
});

const vm = (body: CatalogVM["body"], overrides: Partial<CatalogVM> = {}): CatalogVM => ({
  heading: "Course catalog",
  intro: "Shared courses anyone can study.",
  search: {
    field: { id: "catalog-search", label: "Search", value: "", placeholder: "Title" },
    submitLabel: "Search",
  },
  language: {
    id: "catalog-language",
    label: "Language",
    value: "",
    options: [
      { value: "", label: "All languages" },
      { value: "es", label: "Spanish" },
    ],
  },
  body,
  ...overrides,
});

const actions = (): CatalogActions => ({
  setQuery: vi.fn(),
  search: vi.fn(),
  setTargetLang: vi.fn(),
  copy: vi.fn(),
});

describe("CatalogView", () => {
  it("renders each course with its link, details and copy button", async () => {
    const a = actions();
    const { container } = render(
      <CatalogView vm={vm({ kind: "list", count: "1 course", courses: [card()] })} actions={a} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Course catalog" })).toBeTruthy();
    expect(screen.getByText("1 course")).toBeTruthy();
    const item = within(screen.getByRole("listitem"));
    expect(item.getByRole("link", { name: "World capitals" }).getAttribute("href")).toBe(
      "/courses/c1",
    );
    expect(item.getByText("English for English speakers · 20 words")).toBeTruthy();
    expect(item.getByText("Geography")).toBeTruthy();
    fireEvent.click(item.getByRole("button", { name: "Copy to my courses: World capitals" }));
    expect(a.copy).toHaveBeenCalledWith("c1");
    await expectNoA11yViolations(container);
  });

  it("turns typing, submitting and the language select into actions", () => {
    const a = actions();
    render(<CatalogView vm={vm({ kind: "loading" })} actions={a} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "geo" } });
    expect(a.setQuery).toHaveBeenCalledWith("geo");
    fireEvent.submit(screen.getByLabelText("Search").closest("form") as HTMLFormElement);
    expect(a.search).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "es" } });
    expect(a.setTargetLang).toHaveBeenCalledWith("es");
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("shows copying, copy errors, empty results and load errors", () => {
    const { rerender } = render(
      <CatalogView
        vm={vm({
          kind: "list",
          count: "2 courses",
          courses: [
            card({ copy: { label: "Copying…", disabled: true, error: null } }),
            card({
              id: "c2",
              title: "Spanish",
              description: null,
              copy: { label: "Copy to my courses", disabled: true, error: "Not allowed" },
            }),
          ],
        })}
        actions={actions()}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /Cop/ });
    expect(buttons.map((b) => [b.textContent, (b as HTMLButtonElement).disabled])).toEqual([
      ["Copying…", true],
      ["Copy to my courses", true],
    ]);
    expect(screen.getByText("Not allowed")).toBeTruthy();

    rerender(
      <CatalogView vm={vm({ kind: "empty", message: "No courses match." })} actions={actions()} />,
    );
    expect(screen.getByText("No courses match.")).toBeTruthy();
    rerender(
      <CatalogView vm={vm({ kind: "error", message: "Database down" })} actions={actions()} />,
    );
    expect(screen.getByText("Database down")).toBeTruthy();
  });
});

const shared = aCourse({
  title: "World capitals",
  targetLang: "en",
  itemCount: 20,
  editable: false,
});
const fake = setupFakeApi(() => ({
  courses: [shared, aCourse({ title: "Spanish", targetLang: "es", editable: false })],
}));

describe("CatalogScreen", () => {
  it("searches the fake API and opens the copy after copying", async () => {
    const { container, deps } = renderScreen(<CatalogScreen />);
    expect(await screen.findByRole("link", { name: "Spanish" })).toBeTruthy();
    await expectNoA11yViolations(container);

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "capitals" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(screen.queryByRole("link", { name: "Spanish" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Copy to my courses: World capitals" }));
    await vi.waitFor(() => expect(deps.routes).toHaveLength(1));
    const copy = fake.current.state.courses.find((c) => c.editable);
    expect(copy).toMatchObject({ title: "World capitals", itemCount: 20, learnedCount: 0 });
    expect(deps.routes).toEqual([{ to: "course", courseId: copy?.id }]);
  });
});
