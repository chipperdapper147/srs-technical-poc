/**
 * Study screen: loads a session snapshot (one course's, or a review of what
 * is due across every course), then drives the session state machine
 * (session.ts) through the learner's input. The API grades quiz answers,
 * each with its own course's settings; the copy step of a new word is
 * checked locally.
 */
import {
  type GradingOptions,
  gradeAnswer,
  type StudyItem,
  type StudyMode,
  StudyModeSchema,
} from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { createStore } from "../core/store.ts";
import {
  currentStep,
  initSession,
  isFinished,
  type SessionAction,
  type SessionState,
  sessionReducer,
} from "./session.ts";

export interface StudyParams {
  /** The course to study, or null to review what is due across all courses. */
  courseId: string | null;
  /** Raw `?mode=` value; anything but "review" means learn. All courses are always reviewed. */
  mode: string | null;
}

interface Base {
  courseId: string | null;
  mode: StudyMode;
}

/** What the session knows about an item's course. */
export interface ItemContext {
  courseTitle: string;
  /** BCP 47 tag of the language being typed. */
  lang: string;
  /** For the local copy check; the API grades quiz answers with the same settings. */
  grading: GradingOptions;
}

export type StudyState =
  | (Base & { status: "loading" })
  | (Base & { status: "error"; message: string })
  | (Base & { status: "empty" })
  | (Base & {
      status: "active";
      /** The course being studied, or null when the session mixes courses. */
      courseTitle: string | null;
      /** Per item id. */
      context: Record<string, ItemContext>;
      session: SessionState;
      /** What the learner has typed for the current step. */
      input: string;
      /** The copy attempt didn't match the shown word. */
      copyMiss: boolean;
      submitting: boolean;
      answerError: string | null;
      /** Clock time the current step began, for answer timing. */
      stepStartedAt: number;
    });

export type ActiveStudyState = Extract<StudyState, { status: "active" }>;

export interface StudyActions {
  setInput(text: string): void;
  /** Enter on the form: copy the word, check the answer, or continue after feedback. */
  submit(): void;
  /** Continue after feedback. */
  next(): void;
}

interface Loaded {
  courseTitle: string | null;
  items: StudyItem[];
  context: Record<string, ItemContext>;
}

export function createStudyController(
  { api, queryClient, clock }: ClientDeps,
  params: StudyParams,
): Controller<StudyState, StudyActions> {
  const { courseId } = params;
  const mode = courseId === null ? "review" : StudyModeSchema.catch("learn").parse(params.mode);
  const base = { courseId, mode };
  const store = createStore<StudyState>({ ...base, status: "loading" });
  let active = false;
  /** Bumped by each start(); a load from an earlier run is ignored. */
  let run = 0;

  const update = (fn: (s: ActiveStudyState) => StudyState) =>
    store.set((s) => (s.status === "active" ? fn(s) : s));

  /** Apply a state-machine action; a step change resets the input and timer. */
  function dispatch(action: SessionAction) {
    let finishedNow = false;
    update((s) => {
      const session = sessionReducer(s.session, action);
      if (session.index === s.session.index) return { ...s, session };
      finishedNow = isFinished(session);
      return {
        ...s,
        session,
        input: "",
        copyMiss: false,
        answerError: null,
        stepStartedAt: clock.now(),
      };
    });
    // Learned and due counts changed; the course list, detail and dashboard refetch.
    if (finishedNow) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAll });
    }
  }

  /** A session is a snapshot: fetched once, never cached or refetched under the learner. */
  const snapshot = { staleTime: 0, gcTime: 0 } as const;

  async function loadCourse(id: string): Promise<Loaded> {
    const [course, session] = await Promise.all([
      queryClient.fetchQuery({ queryKey: queryKeys.course(id), queryFn: () => api.course(id) }),
      queryClient.fetchQuery({
        queryKey: queryKeys.study(id, mode),
        queryFn: () => api.study(id, mode),
        ...snapshot,
      }),
    ]);
    const ctx: ItemContext = {
      courseTitle: course.title,
      lang: course.targetLang,
      grading: session.grading,
    };
    return {
      courseTitle: course.title,
      items: session.items,
      context: Object.fromEntries(session.items.map((i) => [i.itemId, ctx])),
    };
  }

  async function loadAll(): Promise<Loaded> {
    const session = await queryClient.fetchQuery({
      queryKey: queryKeys.reviewAll,
      queryFn: () => api.reviewAll(),
      ...snapshot,
    });
    return {
      courseTitle: null,
      items: session.items,
      context: Object.fromEntries(
        session.items.map((i) => [
          i.itemId,
          { courseTitle: i.courseTitle, lang: i.targetLang, grading: i.grading },
        ]),
      ),
    };
  }

  async function load(mine: number) {
    try {
      const loaded = courseId === null ? await loadAll() : await loadCourse(courseId);
      if (!active || mine !== run) return;
      if (loaded.items.length === 0) {
        store.set({ ...base, status: "empty" });
        return;
      }
      store.set({
        ...base,
        status: "active",
        courseTitle: loaded.courseTitle,
        context: loaded.context,
        session: initSession(mode, loaded.items),
        input: "",
        copyMiss: false,
        submitting: false,
        answerError: null,
        stepStartedAt: clock.now(),
      });
    } catch (error) {
      if (active && mine === run) {
        store.set({ ...base, status: "error", message: errorMessage(error) });
      }
    }
  }

  async function checkAnswer(s: ActiveStudyState) {
    const step = currentStep(s.session);
    if (!step || !s.input.trim() || s.submitting) return;
    update((x) => ({ ...x, submitting: true, answerError: null }));
    try {
      const result = await api.answer({
        itemId: step.item.itemId,
        answer: s.input,
        durationMs: Math.max(0, Math.round(clock.now() - s.stepStartedAt)),
      });
      if (!active) return;
      update((x) => ({ ...x, submitting: false }));
      dispatch({ type: "graded", result });
    } catch (error) {
      if (active) update((x) => ({ ...x, submitting: false, answerError: errorMessage(error) }));
    }
  }

  const actions: StudyActions = {
    setInput: (text) => update((s) => ({ ...s, input: text, copyMiss: false })),

    submit() {
      const s = store.get();
      if (s.status !== "active") return;
      const step = currentStep(s.session);
      if (!step) return;
      if (step.kind === "present") {
        const grading = s.context[step.item.itemId]?.grading;
        const { verdict } = gradeAnswer(
          s.input,
          [step.item.term, ...step.item.alternatives],
          grading ?? { mode: "lenient", accentSensitive: false },
        );
        if (verdict === "wrong") update((x) => ({ ...x, copyMiss: true }));
        else dispatch({ type: "presented" });
        return;
      }
      if (s.session.feedback) dispatch({ type: "next" });
      else void checkAnswer(s);
    },

    next: () => dispatch({ type: "next" }),
  };

  return {
    store,
    actions,
    start() {
      active = true;
      run += 1;
      if (store.get().status === "loading") void load(run);
      return () => {
        active = false;
      };
    },
  };
}
