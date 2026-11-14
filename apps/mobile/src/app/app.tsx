import { Providers } from "@/platform/providers";
import { AppShell } from "@/views/app-shell/app-shell";
import { Router } from "./router";

/** The root, like the web's app/layout.tsx: platform providers around the shell. */
export function App() {
  return (
    <Providers>
      <AppShell>
        <Router />
      </AppShell>
    </Providers>
  );
}
