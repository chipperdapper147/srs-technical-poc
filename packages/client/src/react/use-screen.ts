import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ControllerFactory } from "../core/controller.ts";
import { useClientDeps } from "./provider.tsx";

/**
 * Bind a screen's controller and view model to React. The controller is
 * created once per distinct `params` (compared by value), started in an
 * effect and stopped on unmount; the view model is recomputed when the
 * controller's state changes.
 */
export function useScreen<P, S, A, VM>(
  createController: ControllerFactory<P, S, A>,
  viewModel: (state: S) => VM,
  params: P,
): { vm: VM; actions: A } {
  const deps = useClientDeps();
  const key = JSON.stringify(params);
  // biome-ignore lint/correctness/useExhaustiveDependencies: params are compared by value via `key`
  const controller = useMemo(() => createController(deps, params), [createController, deps, key]);
  useEffect(() => controller.start(), [controller]);
  const state = useSyncExternalStore(
    controller.store.subscribe,
    controller.store.get,
    controller.store.get,
  );
  const vm = useMemo(() => viewModel(state), [viewModel, state]);
  return { vm, actions: controller.actions };
}
