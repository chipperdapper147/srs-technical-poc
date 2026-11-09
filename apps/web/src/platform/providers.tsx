"use client";

import { type ClientDeps, createApiClient, createQueryClient } from "@app/client";
import { ClientProvider } from "@app/client/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { hrefFor } from "./routes";

/** The web's implementation of the client ports, created once per page load. */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [deps] = useState<ClientDeps>(() => ({
    api: createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" }),
    queryClient: createQueryClient(),
    navigator: { navigate: (route) => routerRef.current.push(hrefFor(route)) },
    clock: { now: () => performance.now() },
  }));
  return <ClientProvider deps={deps}>{children}</ClientProvider>;
}
