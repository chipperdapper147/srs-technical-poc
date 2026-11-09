/**
 * Server data as a controller sees it, and a bridge from TanStack Query's
 * framework-free QueryObserver to that shape.
 */
import {
  type QueryClient,
  type QueryKey,
  QueryObserver,
  type QueryObserverOptions,
} from "@tanstack/query-core";
import { errorMessage } from "./controller.ts";

export type Remote<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export const LOADING = { status: "loading" } as const;

/** Subscribe to a query; `onChange` gets every state. Returns the unsubscribe. */
export function observeQuery<T>(
  queryClient: QueryClient,
  options: QueryObserverOptions<T, Error, T, T, QueryKey>,
  onChange: (remote: Remote<T>) => void,
): () => void {
  const observer = new QueryObserver<T, Error, T, T, QueryKey>(queryClient, options);
  const emit = () => {
    const result = observer.getCurrentResult();
    if (result.data !== undefined) onChange({ status: "ready", data: result.data });
    else if (result.error) onChange({ status: "error", message: errorMessage(result.error) });
    else onChange(LOADING);
  };
  const unsubscribe = observer.subscribe(emit);
  emit();
  return unsubscribe;
}
