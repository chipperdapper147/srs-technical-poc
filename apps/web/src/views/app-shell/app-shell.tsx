import { shellViewModel } from "@app/client";
import type { ReactNode } from "react";
import { RouteLink } from "@/platform/route-link";

/** Header and page frame. Static, so it reads its view model directly. */
export function AppShell({ children }: { children: ReactNode }) {
  const vm = shellViewModel();
  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3 text-sm">
          <RouteLink to={vm.brand.route} className="font-semibold">
            {vm.brand.label}
          </RouteLink>
          {vm.nav.map((item) => (
            <RouteLink
              key={item.label}
              to={item.route}
              className="text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </RouteLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </>
  );
}
