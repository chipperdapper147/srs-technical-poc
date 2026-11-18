import type { AuthActions, ShellVM } from "@app/client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RouteLink } from "@/platform/route-link";
import { Loading } from "@/views/shared/query-state";
import { SignInView } from "@/views/sign-in/sign-in-view";

/** Header and page frame: the page when signed in, else sign-in (or nothing yet). */
export function AppShellView({
  vm,
  actions,
  children,
}: {
  vm: ShellVM;
  actions: AuthActions;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:gap-x-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
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
          {vm.account && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground">{vm.account.name}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={vm.account.signOut.disabled}
                onClick={actions.signOut}
              >
                {vm.account.signOut.label}
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {vm.content.kind === "screen" && children}
        {vm.content.kind === "loading" && <Loading />}
        {vm.content.kind === "signIn" && <SignInView vm={vm.content.signIn} actions={actions} />}
      </main>
    </>
  );
}
