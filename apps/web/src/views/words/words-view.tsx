import type {
  TextFieldVM,
  WordDeleteVM,
  WordDraft,
  WordFormVM,
  WordsActions,
  WordsUnitVM,
  WordsVM,
  WordVM,
} from "@app/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";

export function WordsView({ vm, actions }: { vm: WordsVM; actions: WordsActions }) {
  if (vm.kind === "loading") return <Loading />;
  if (vm.kind === "error") return <ErrorMessage message={vm.message} />;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <RouteLink to={vm.back.route} className="text-sm text-muted-foreground">
          ← {vm.back.label}
        </RouteLink>
        <h1 className="text-2xl font-semibold">{vm.title}</h1>
        <p className="text-muted-foreground">{vm.courseTitle}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={vm.search.id}>{vm.search.label}</Label>
        <Input
          id={vm.search.id}
          type="search"
          value={vm.search.value}
          placeholder={vm.search.placeholder}
          onChange={(e) => actions.setQuery(e.target.value)}
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {vm.summary}
        </p>
      </div>

      {vm.readOnlyNotice && <p className="text-sm text-muted-foreground">{vm.readOnlyNotice}</p>}
      <p className="text-sm empty:hidden" role="status">
        {vm.notice}
      </p>
      {vm.empty && <p className="text-sm text-muted-foreground">{vm.empty}</p>}

      {vm.units.map((unit) => (
        <UnitCard key={unit.id} unit={unit} actions={actions} />
      ))}
    </div>
  );
}

function UnitCard({ unit, actions }: { unit: WordsUnitVM; actions: WordsActions }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{unit.title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {unit.empty && <p className="text-sm text-muted-foreground">{unit.empty}</p>}
        {unit.words.length > 0 && (
          <ul className="divide-y">
            {unit.words.map((word) => (
              <li key={word.id} className="py-3 first:pt-0 last:pb-0">
                {word.form ? (
                  <WordForm form={word.form} actions={actions} />
                ) : (
                  <Word word={word} actions={actions} />
                )}
              </li>
            ))}
          </ul>
        )}
        {unit.addForm && <WordForm form={unit.addForm} actions={actions} />}
        {unit.add && (
          <Button
            variant="outline"
            size="sm"
            aria-label={unit.add.accessibleLabel}
            onClick={() => actions.startAdd(unit.id)}
          >
            {unit.add.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Word({ word, actions }: { word: WordVM; actions: WordsActions }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium" data-testid="word-term">
            {word.term}
          </p>
          <p className="text-sm text-muted-foreground">{word.definition}</p>
          {word.alternatives && <p className="text-sm">{word.alternatives}</p>}
          {word.notes && <p className="text-sm text-muted-foreground">{word.notes}</p>}
        </div>
        {(word.edit || word.remove) && (
          <div className="flex gap-2">
            {word.edit && (
              <Button
                variant="outline"
                size="sm"
                aria-label={word.edit.accessibleLabel}
                onClick={() => actions.startEdit(word.id)}
              >
                {word.edit.label}
              </Button>
            )}
            {word.remove && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={word.remove.accessibleLabel}
                onClick={() => actions.askDelete(word.id)}
              >
                {word.remove.label}
              </Button>
            )}
          </div>
        )}
      </div>
      {word.confirmDelete && <ConfirmDelete confirm={word.confirmDelete} actions={actions} />}
    </div>
  );
}

function ConfirmDelete({ confirm, actions }: { confirm: WordDeleteVM; actions: WordsActions }) {
  return (
    <Alert>
      <AlertDescription className="space-y-3">
        <p>{confirm.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={!confirm.canConfirm}
            onClick={actions.confirmDelete}
          >
            {confirm.confirmLabel}
          </Button>
          <Button variant="outline" size="sm" onClick={actions.cancelDelete}>
            {confirm.cancelLabel}
          </Button>
        </div>
        {confirm.error && <p className="text-destructive">{confirm.error}</p>}
      </AlertDescription>
    </Alert>
  );
}

function WordForm({ form, actions }: { form: WordFormVM; actions: WordsActions }) {
  const field = (name: keyof WordDraft, vm: TextFieldVM) => ({
    id: vm.id,
    value: vm.value,
    required: vm.required,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      actions.setDraft(name, e.target.value),
  });
  return (
    <form
      aria-label={form.title}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        actions.save();
      }}
    >
      <p className="font-medium">{form.title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={form.term.id}>{form.term.label}</Label>
          <Input {...field("term", form.term)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={form.definition.id}>{form.definition.label}</Label>
          <Input {...field("definition", form.definition)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={form.alternatives.id}>{form.alternatives.label}</Label>
          <Textarea
            rows={2}
            aria-describedby={`${form.alternatives.id}-help`}
            {...field("alternatives", form.alternatives)}
          />
          <p id={`${form.alternatives.id}-help`} className="text-xs text-muted-foreground">
            {form.alternatives.help}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={form.notes.id}>{form.notes.label}</Label>
          <Textarea rows={2} {...field("notes", form.notes)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!form.canSubmit}>
          {form.submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={actions.cancelEdit}>
          {form.cancelLabel}
        </Button>
      </div>
      {form.error && (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
