import type { Route } from "@app/client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { hrefFor } from "./routes";

/** next/link for a platform-neutral route, so views never build URLs. */
export function RouteLink({
  to,
  ...props
}: { to: Route } & Omit<ComponentProps<typeof Link>, "href">) {
  return <Link href={hrefFor(to)} {...props} />;
}
