import type { FeedbackVM, StudyActions, StudyStepVM, StudyVM } from "@app/client";
import type { Verdict } from "@app/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";

export function StudyView({ vm, actions }: { vm: StudyVM; actions: StudyActions }) {
  switch (vm.kind) {
    case "loading":
      return <Loading />;
    case "error":
      return <ErrorMessage message={vm.message} />;
    case "empty":
      return (
        <div className="space-y-4">
          <h1>{vm.message}</h1>
          <RouteLink to={vm.back} className={buttonVariants({ variant: "outline" })}>
            {vm.backLabel}
          </RouteLink>
        </div>
      );
    case "session":
      return (
        <div className="space-y-6" data-testid="study-session" data-step={vm.stepIndex}>
          <h1 className="sr-only">{vm.heading}</h1>
          <div className="flex items-center gap-4">
            <RouteLink to={vm.back} className="text-sm text-muted-foreground">
              ← {vm.courseTitle}
            </RouteLink>
            <Progress value={vm.progress} aria-label={vm.progressLabel} className="flex-1" />
          </div>
          {/* Keyed by step so each step mounts fresh and its input takes focus. */}
          <Step key={vm.stepIndex} step={vm.step} lang={vm.lang} actions={actions} />
        </div>
      );
  }
}

function Step({ step, lang, actions }: { step: StudyStepVM; lang: string; actions: StudyActions }) {
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    actions.submit();
  };
  switch (step.kind) {
    case "present":
      return (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Badge variant="secondary">{step.badge}</Badge>
            <span className="text-xs text-muted-foreground">{step.unitTitle}</span>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <p lang={lang} data-testid="study-term" className="text-3xl font-semibold">
                {step.term}
              </p>
              <p data-testid="study-definition" className="text-lg text-muted-foreground">
                {step.definition}
              </p>
              {step.alsoAccepted && (
                <p className="text-sm text-muted-foreground">{step.alsoAccepted}</p>
              )}
              {step.notes && <p className="pt-2 text-sm">{step.notes}</p>}
            </div>
            <form className="space-y-2" onSubmit={onSubmit}>
              <AnswerInput
                lang={lang}
                aria-label={step.placeholder}
                placeholder={step.placeholder}
                value={step.input}
                onChange={(e) => actions.setInput(e.target.value)}
              />
              {step.miss && <p className="text-sm text-destructive">{step.miss}</p>}
            </form>
          </CardContent>
        </Card>
      );
    case "quiz":
      return (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <span className="text-xs text-muted-foreground">{step.unitTitle}</span>
          </CardHeader>
          <CardContent className="space-y-5">
            <p data-testid="study-prompt" className="text-2xl font-semibold">
              {step.prompt}
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
              <AnswerInput
                lang={lang}
                aria-label={step.placeholder}
                placeholder={step.placeholder}
                value={step.input}
                readOnly={step.locked}
                onChange={(e) => actions.setInput(e.target.value)}
              />
              {step.feedback ? (
                <FeedbackPanel feedback={step.feedback} lang={lang} />
              ) : (
                <Button type="submit" disabled={!step.canCheck}>
                  {step.checkLabel}
                </Button>
              )}
              {step.feedback && (
                <Button type="submit" autoFocus>
                  {step.continueLabel}
                </Button>
              )}
              {step.error && <ErrorMessage message={step.error} />}
            </form>
          </CardContent>
        </Card>
      );
    case "summary":
      return (
        <Card>
          <CardHeader className="text-lg font-semibold">
            <h2>{step.title}</h2>
          </CardHeader>
          <CardContent className="space-y-1 text-sm" data-testid="session-summary">
            {step.tally.map((t) => (
              <p key={t.verdict}>
                {t.label}: <span data-testid={`tally-${t.verdict}`}>{t.count}</span>
              </p>
            ))}
          </CardContent>
          <CardFooter className="gap-3">
            <RouteLink to={step.back} className={buttonVariants()}>
              {step.backLabel}
            </RouteLink>
          </CardFooter>
        </Card>
      );
  }
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

const VERDICT_STYLE: Record<Verdict, string> = {
  exact: "border-verdict-exact/40 bg-verdict-exact/10",
  typo: "border-verdict-typo/40 bg-verdict-typo/10",
  wrong: "border-verdict-wrong/40 bg-verdict-wrong/10",
};

function FeedbackPanel({ feedback, lang }: { feedback: FeedbackVM; lang: string }) {
  return (
    <div
      role="status"
      data-verdict={feedback.verdict}
      className={cn("rounded-lg border p-3 text-sm", VERDICT_STYLE[feedback.verdict])}
    >
      <p className="font-medium">{feedback.title}</p>
      {feedback.answer && (
        <p>
          Answer:{" "}
          <span lang={lang} className="font-semibold">
            {feedback.answer}
          </span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">{feedback.nextReview}</p>
    </div>
  );
}
