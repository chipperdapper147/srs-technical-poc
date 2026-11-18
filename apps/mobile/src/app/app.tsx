import { Providers } from "@/platform/providers";
import { AppShellScreen } from "@/views/app-shell/app-shell-screen";
import { Router } from "./router";

/** The root, like the web's app/layout.tsx: platform providers around the shell. */
export function App() {
  return (
    <Providers>
      <AppShellScreen>
        <Router />
      </AppShellScreen>
    </Providers>
  );
}
