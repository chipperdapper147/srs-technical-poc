"use client";

import {
  type ClientDeps,
  createAccessGate,
  createApiClient,
  createQueryClient,
  type KeyStorage,
} from "@app/client";
import { ClientProvider } from "@app/client/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { hrefFor } from "./routes";

const ACCESS_KEY_STORAGE = "srs.access-key";

/** The access key in localStorage; unavailable storage (private mode, SSR) keeps nothing. */
const localKeyStorage: KeyStorage = {
  read() {
    try {
      return window.localStorage.getItem(ACCESS_KEY_STORAGE);
    } catch {
      return null;
    }
  },
  write(key) {
    try {
      if (key === null) window.localStorage.removeItem(ACCESS_KEY_STORAGE);
      else window.localStorage.setItem(ACCESS_KEY_STORAGE, key);
    } catch {}
  },
};

/** The web's implementation of the client ports, created once per page load. */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [deps] = useState<ClientDeps>(() => {
    const access = createAccessGate(localKeyStorage);
    return {
      api: createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
        access,
      }),
      access,
      queryClient: createQueryClient(),
      navigator: { navigate: (route) => routerRef.current.push(hrefFor(route)) },
      clock: { now: () => performance.now() },
    };
  });
  // Until hydration the server HTML has no event handlers (a form would submit
  // natively). e2e page objects wait for this before interacting.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "";
  }, []);
  return <ClientProvider deps={deps}>{children}</ClientProvider>;
}
