"use client";

import {
  type AnswerResult,
  type CourseDetail,
  gradeAnswer,
  type StudyMode,
  StudyModeSchema,
  type StudySession,
} from "@app/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useReducer, useRef, useState } from "react";
import { ErrorMessage, Loading } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api, queryKeys } from "@/lib/api";
import {
  currentStep,
  initSession,
  isFinished,
  progress,
  type Step,
  sessionReducer,
} from "@/lib/study-session";
import { cn } from "@/lib/utils";

export default function StudyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudyLoader />
    </Suspense>
  );
}

function StudyLoader() {
  const { id } = useParams<{ id: string }>();
  const mode = StudyModeSchema.catch("learn").parse(useSearchParams().get("mode"));

  const course = useQuery({ queryKey: queryKeys.course(id), queryFn: () => api.course(id) });
  // A session is a snapshot: never refetch it underneath the learner.
  const session = useQuery({
    queryKey: queryKeys.study(id, mode),
    queryFn: () => api.study(id, mode),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  if (course.error) return <ErrorMessage error={course.error} />;
  if (session.error) return <ErrorMessage error={session.error} />;
  if (!course.data || !session.data) return <Loading />;
  if (session.data.items.length === 0) {
    return (
      <div className="space-y-4">
        <p>{mode === "learn" ? "No new words left in this course." : "Nothing due right now."}</p>
        <Link href={`/courses/${id}`} className={buttonVariants({ variant: "outline" })}>
          Back to course
        </Link>
      </div>
    );
  }
  return <Session course={course.data} mode={mode} session={session.data} />;
}

function Session({
  course,
  mode,
  session,
}: {
  course: CourseDetail;
  mode: StudyMode;
  session: StudySession;
}) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () =>
    initSession(mode, session.items),
  );
  const queryClient = useQueryClient();
  const finished = isFinished(state);

  useEffect(() => {
    if (finished) queryClient.invalidateQueries({ queryKey: queryKeys.courses });
  }, [finished, queryClient]);

  const step = currentStep(state);

  return (
    <div className="space-y-6" data-testid="study-session" data-step={state.index}>
      <div className="flex items-center gap-4">
        <Link href={`/courses/${course.id}`} className="text-sm text-muted-foreground">
          ← {course.title}
        </Link>
        <Progress value={progress(state) * 100} className="flex-1" />
      </div>

      {step ? (
        step.kind === "present" ? (
          <PresentStep
            key={state.index}
            step={step}
            lang={course.targetLang}
            grading={session.grading}
            onDone={() => dispatch({ type: "presented" })}
          />
        ) : (
          <QuizStep
            key={state.index}
            step={step}
            lang={course.targetLang}
            feedback={state.feedback}
            onGraded={(result) => dispatch({ type: "graded", result })}
            onNext={() => dispatch({ type: "next" })}
          />
        )
      ) : (
        <Card>
          <CardHeader className="text-lg font-semibold">Session complete</CardHeader>
          <CardContent className="space-y-1 text-sm" data-testid="session-summary">
            <p>
              Correct: <span data-testid="tally-exact">{state.tally.exact}</span>
            </p>
            <p>
              Almost (typo): <span data-testid="tally-typo">{state.tally.typo}</span>
            </p>
            <p>
              Wrong: <span data-testid="tally-wrong">{state.tally.wrong}</span>
            </p>
          </CardContent>
          <CardFooter className="gap-3">
            <Link href={`/courses/${course.id}`} className={buttonVariants()}>
              Back to course
            </Link>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

function AnswerInput(props: React.ComponentProps<typeof Input> & { lang: string }) {
  return (
    <Input
      autoFocus
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className="h-11 text-lg"
      {...props}
    />
  );
}

function PresentStep({
  step,
  lang,
  grading,
  onDone,
}: {
  step: Step;
  lang: string;
  grading: StudySession["grading"];
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [miss, setMiss] = useState(false);
  const { item } = step;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Badge variant="secondary">New word</Badge>
        <span className="text-xs text-muted-foreground">{item.unitTitle}</span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <p lang={lang} data-testid="study-term" className="text-3xl font-semibold">
            {item.term}
          </p>
          <p data-testid="study-definition" className="text-lg text-muted-foreground">
            {item.definition}
          </p>
          {item.alternatives.length > 0 && (
            <p className="text-sm text-muted-foreground">Also: {item.alternatives.join(", ")}</p>
          )}
          {item.notes && <p className="pt-2 text-sm">{item.notes}</p>}
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const { verdict } = gradeAnswer(value, [item.term, ...item.alternatives], grading);
            if (verdict === "wrong") setMiss(true);
            else onDone();
          }}
        >
          <AnswerInput
            lang={lang}
            placeholder="Type it to continue"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMiss(false);
            }}
          />
          {miss && <p className="text-sm text-destructive">Type the word as shown above.</p>}
        </form>
      </CardContent>
    </Card>
  );
}

const FEEDBACK = {
  exact: { label: "Correct", className: "border-green-600/40 bg-green-600/10" },
  typo: { label: "Almost: watch the spelling", className: "border-amber-500/40 bg-amber-500/10" },
  wrong: { label: "Not quite", className: "border-destructive/40 bg-destructive/10" },
} as const;

function QuizStep({
  step,
  lang,
  feedback,
  onGraded,
  onNext,
}: {
  step: Step;
  lang: string;
  feedback: AnswerResult | null;
  onGraded: (result: AnswerResult) => void;
  onNext: () => void;
}) {
  const [value, setValue] = useState("");
  const startedAt = useRef(performance.now());
  const { item } = step;
  const answer = useMutation({
    mutationFn: () =>
      api.answer({
        itemId: item.itemId,
        answer: value,
        durationMs: Math.round(performance.now() - startedAt.current),
      }),
    onSuccess: onGraded,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-xs text-muted-foreground">{item.unitTitle}</span>
      </CardHeader>
      <CardContent className="space-y-5">
        <p data-testid="study-prompt" className="text-2xl font-semibold">
          {item.definition}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (feedback) onNext();
            else if (value.trim() && !answer.isPending) answer.mutate();
          }}
          className="space-y-3"
        >
          <AnswerInput
            lang={lang}
            placeholder="Type the answer"
            value={value}
            readOnly={!!feedback}
            onChange={(e) => setValue(e.target.value)}
          />
          {feedback ? (
            <FeedbackPanel result={feedback} lang={lang} />
          ) : (
            <Button type="submit" disabled={!value.trim() || answer.isPending}>
              Check
            </Button>
          )}
          {feedback && (
            <Button type="submit" autoFocus>
              Continue
            </Button>
          )}
          {answer.error && <ErrorMessage error={answer.error} />}
        </form>
      </CardContent>
    </Card>
  );
}

function FeedbackPanel({ result, lang }: { result: AnswerResult; lang: string }) {
  const style = FEEDBACK[result.verdict];
  return (
    <div
      role="status"
      data-verdict={result.verdict}
      className={cn("rounded-lg border p-3 text-sm", style.className)}
    >
      <p className="font-medium">{style.label}</p>
      {result.verdict !== "exact" && (
        <p>
          Answer:{" "}
          <span lang={lang} className="font-semibold">
            {result.verdict === "typo" ? result.matched : result.term}
          </span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Next review {new Date(result.nextDue).toLocaleString()}
      </p>
    </div>
  );
}
