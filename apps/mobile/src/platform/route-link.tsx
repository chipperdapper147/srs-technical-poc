import type { Route } from "@app/client";
import { useClientDeps } from "@app/client/react";
import { Pressable, type PressableProps } from "react-native";

/** A pressable link to a platform-neutral route, so views never navigate themselves. */
export function RouteLink({ to, ...props }: { to: Route } & Omit<PressableProps, "onPress">) {
  const { navigator } = useClientDeps();
  return <Pressable accessibilityRole="link" onPress={() => navigator.navigate(to)} {...props} />;
}
