import { createContext, type ReactNode, useContext } from "react";
import type { ClientDeps } from "../core/ports.ts";

const DepsContext = createContext<ClientDeps | null>(null);

/** Supplies the platform's ports (API, query client, navigator, clock) to every screen. */
export function ClientProvider({ deps, children }: { deps: ClientDeps; children: ReactNode }) {
  return <DepsContext.Provider value={deps}>{children}</DepsContext.Provider>;
}

export function useClientDeps(): ClientDeps {
  const deps = useContext(DepsContext);
  if (!deps) throw new Error("useClientDeps: wrap the app in <ClientProvider>");
  return deps;
}
