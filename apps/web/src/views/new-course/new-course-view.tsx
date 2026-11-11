import type { NewCourseActions, NewCourseForm, NewCourseVM, TextFieldVM } from "@app/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "@/views/shared/rich-text";

export function NewCourseView({ vm, actions }: { vm: NewCourseVM; actions: NewCourseActions }) {
  const input = (name: keyof NewCourseForm, field: TextFieldVM) => ({
    id: field.id,
    value: field.value,
    placeholder: field.placeholder,
    required: field.required,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      actions.setField(name, e.target.value),
  });
  const { fields } = vm;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{vm.title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            actions.submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={fields.title.id}>{fields.title.label}</Label>
            <Input {...input("title", fields.title)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fields.description.id}>{fields.description.label}</Label>
            <Textarea rows={2} {...input("description", fields.description)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={fields.targetLang.id}>{fields.targetLang.label}</Label>
              <Input {...input("targetLang", fields.targetLang)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fields.sourceLang.id}>{fields.sourceLang.label}</Label>
              <Input {...input("sourceLang", fields.sourceLang)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <RichText parts={vm.hint} />
          </p>
          <Button type="submit" disabled={vm.submitting}>
            {vm.submitLabel}
          </Button>
          {vm.error && (
            <Alert variant="destructive">
              <AlertDescription>{vm.error}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
