/**
 * Course catalog: shared courses, searched and filtered, and "Copy to my
 * courses". One query whose key follows the applied filters; the previous
 * results stay on screen while the next ones load.
 */
import type { Catalog } from "@app/shared";
import { keepPreviousData, QueryObserver } from "@tanstack/query-core";
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { LOADING, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export interface CatalogState {
  /** The search box, as typed. */
  query: string;
  /** The search applied to the results: the box when last submitted. */
  search: string;
  /** BCP 47 tag the results are filtered to, or "" for every language. */
  targetLang: string;
  catalog: Remote<Catalog>;
  /** The course being copied, if any. */
  copying: string | null;
  copyError: { courseId: string; message: string } | null;
}

export interface CatalogActions {
  setQuery(text: string): void;
  /** Apply the search box. */
  search(): void;
  /** Filter by language ("" for all), applying the search box too. */
  setTargetLang(tag: string): void;
  /** Copy a course to the learner's courses, then open the copy. */
  copy(courseId: string): void;
}

export function createCatalogController({
  api,
  queryClient,
  navigator,
}: ClientDeps): Controller<CatalogState, CatalogActions> {
  const store = createStore<CatalogState>({
    query: "",
    search: "",
    targetLang: "",
    catalog: LOADING,
    copying: null,
    copyError: null,
  });
  const patch = (p: Partial<CatalogState>) => store.set((s) => ({ ...s, ...p }));
  let observer: QueryObserver<Catalog> | null = null;
  let active = false;

  const options = () => {
    const { search, targetLang } = store.get();
    const q = search.trim();
    return {
      queryKey: queryKeys.catalog(q, targetLang),
      queryFn: () => api.catalog({ q, targetLang: targetLang || undefined }),
      placeholderData: keepPreviousData,
    };
  };
  const emit = () => {
    if (!observer) return;
    const result = observer.getCurrentResult();
    if (result.data !== undefined) patch({ catalog: { status: "ready", data: result.data } });
    else if (result.error)
      patch({ catalog: { status: "error", message: errorMessage(result.error) } });
    else patch({ catalog: LOADING });
  };
  const apply = (p: Partial<CatalogState>) => {
    patch(p);
    observer?.setOptions(options());
  };

  return {
    store,
    actions: {
      setQuery: (query) => patch({ query }),
      search: () => apply({ search: store.get().query }),
      setTargetLang: (targetLang) => apply({ targetLang, search: store.get().query }),
      async copy(courseId) {
        if (store.get().copying) return;
        patch({ copying: courseId, copyError: null });
        try {
          const course = await api.copyCourse(courseId);
          // The new course is in the list and on the dashboard.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAll }),
          ]);
          queryClient.setQueryData(queryKeys.course(course.id), course);
          patch({ copying: null });
          if (active) navigator.navigate({ to: "course", courseId: course.id });
        } catch (error) {
          patch({ copying: null, copyError: { courseId, message: errorMessage(error) } });
        }
      },
    },
    start() {
      active = true;
      const current = new QueryObserver<Catalog>(queryClient, options());
      observer = current;
      const unsubscribe = current.subscribe(emit);
      emit();
      return () => {
        active = false;
        unsubscribe();
        if (observer === current) observer = null;
      };
    },
  };
}
