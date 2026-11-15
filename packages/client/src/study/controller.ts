/**
 * Study screen: loads a session snapshot (one course's, or a review of what
 * is due across every course), then drives the session state machine
 * (session.ts) through the learner's input. The API grades quiz answers,
 * each with its own course's settings; the copy step of a new word is
 * checked locally.
 *
 * Study aids, all decided by the API: a hint reveals one more letter of the
 * word (the answer request says how many were used, and the API caps the
 * rating); "I was right" overrides a wrong or typo verdict while it shows;
 * undo takes back the latest answer, from anywhere in the session.
 */
import {
  type GradingOptions,
  gradeAnswer,
  maxHints,
  type StudyItem,
  type StudyMode,
  StudyModeSchema,
} from "@app/shared";
import { ApiError } from "../api/client.ts";
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
      /** Letters of the current word revealed by hints. */
      hints: number;
      /** Counts every fresh start of a step, so a view can remount it (undo restarts one in place). */
      attempt: number;
      /** An override or undo is in flight; the session waits for it. */
      aidPending: "override" | "undo" | null;
      /** Why the last override or undo failed. */
      aidError: string | null;
    });

export type ActiveStudyState = Extract<StudyState, { status: "active" }>;

export interface StudyActions {
  setInput(text: string): void;
  /** Enter on the form: copy the word, check the answer, or continue after feedback. */
  submit(): void;
  /** Continue after feedback. */
  next(): void;
  /** Reveal one more letter of the word being quizzed. */
  hint(): void;
  /** "I was right": count the answer being shown as correct. */
  override(): void;
  /** Take back the latest answer and go back to it. */
  undo(): void;
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

  /** Learned and due counts changed; the course list, detail, dashboard and stats refetch. */
  function invalidateProgress() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.courses });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAll });
    void queryClient.invalidateQueries({ queryKey: queryKeys.statsAll });
  }

  /**
   * Apply a state-machine action. A step that starts afresh (the next one,
   * or one undo went back to) resets the input, hints and timer.
   */
  function dispatch(action: SessionAction) {
    let finishedNow = false;
    update((s) => {
      const session = sessionReducer(s.session, action);
      const fresh =
        session.index !== s.session.index || (s.session.feedback !== null && !session.feedback);
      if (!fresh) return { ...s, session };
      finishedNow = isFinished(session);
      return {
        ...s,
        session,
        input: "",
        copyMiss: false,
        answerError: null,
        aidError: null,
        hints: 0,
        attempt: s.attempt + 1,
        stepStartedAt: clock.now(),
      };
    });
    if (finishedNow) invalidateProgress();
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
        hints: 0,
        attempt: 0,
        aidPending: null,
        aidError: null,
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
        hints: s.hints,
      });
      if (!active) return;
      update((x) => ({ ...x, submitting: false }));
      dispatch({ type: "graded", result });
    } catch (error) {
      if (active) update((x) => ({ ...x, submitting: false, answerError: errorMessage(error) }));
    }
  }

  /** Run an override or undo; a 409 (too late, or not the latest) means it is no longer offered. */
  async function aid(
    kind: "override" | "undo",
    reviewId: string,
    request: () => Promise<SessionAction>,
  ) {
    update((x) => ({ ...x, aidPending: kind, aidError: null }));
    try {
      const action = await request();
      if (!active) return;
      update((x) => ({ ...x, aidPending: null }));
      dispatch(action);
      if (action.type === "undone") invalidateProgress();
    } catch (error) {
      if (!active) return;
      const gone = error instanceof ApiError && error.status === 409;
      update((x) => ({
        ...x,
        aidPending: null,
        aidError: errorMessage(error),
        session:
          gone && x.session.last?.reviewId === reviewId ? { ...x.session, last: null } : x.session,
      }));
    }
  }

  const actions: StudyActions = {
    setInput: (text) => update((s) => ({ ...s, input: text, copyMiss: false })),

    submit() {
      const s = store.get();
      if (s.status !== "active" || s.aidPending) return;
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

    next() {
      const s = store.get();
      if (s.status === "active" && !s.aidPending) dispatch({ type: "next" });
    },

    hint() {
      const s = store.get();
      if (s.status !== "active" || s.session.feedback || s.submitting) return;
      const step = currentStep(s.session);
      if (step?.kind !== "quiz") return;
      const hints = Math.min(s.hints + 1, maxHints(step.item.term));
      update((x) => ({ ...x, hints }));
    },

    override() {
      const s = store.get();
      if (s.status !== "active" || s.aidPending) return;
      const { feedback, last } = s.session;
      const reviewId = feedback?.reviewId;
      if (!feedback || feedback.overridden || !reviewId || last?.reviewId !== reviewId) return;
      void aid("override", reviewId, async () => ({
        type: "overridden",
        result: await api.overrideAnswer(reviewId),
      }));
    },

    undo() {
      const s = store.get();
      if (s.status !== "active" || s.aidPending || !s.session.last) return;
      const { reviewId } = s.session.last;
      void aid("undo", reviewId, async () => {
        await api.undoAnswer(reviewId);
        return { type: "undone" };
      });
    },
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
