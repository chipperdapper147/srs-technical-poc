"use client";

import {
  type ClientDeps,
  createApiClient,
  createAuth,
  createDevAuth,
  createQueryClient,
} from "@app/client";
import { ClientProvider } from "@app/client/react";
import type { Route as NextRoute } from "next";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { auth0Config, createAuth0Session } from "./auth0-session";
import { hrefFor } from "./routes";

/** The web's implementation of the client ports, created once per page load. */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [deps] = useState<ClientDeps>(() => {
    const config = auth0Config();
    // Auth0 when the build has its variables (production); the dev auth port otherwise.
    const auth = config
      ? createAuth(
          createAuth0Session(config, {
            replace: (href) => routerRef.current.replace(href as NextRoute),
          }),
        )
      : createDevAuth();
    return {
      api: createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
        auth,
      }),
      auth,
      queryClient: createQueryClient(),
      navigator: { navigate: (route) => routerRef.current.push(hrefFor(route)) },
      clock: {
        now: () => performance.now(),
        timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      // `next dev` builds development; `next build` (every deploy) builds production.
      environment: process.env.NODE_ENV === "development" ? "development" : "production",
    };
  });
  // Until hydration the server HTML has no event handlers (a form would submit
  // natively). e2e page objects wait for this before interacting.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "";
  }, []);
  return <ClientProvider deps={deps}>{children}</ClientProvider>;
}
