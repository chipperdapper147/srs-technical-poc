import type { AccessActions, AccessVM } from "@app/client";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The page, or the access-key form when the API wants a key. */
export function AccessView({
  vm,
  actions,
  children,
}: {
  vm: AccessVM;
  actions: AccessActions;
  children: ReactNode;
}) {
  if (vm.kind === "open") {
    return (
      <>
        {children}
        {vm.forget && (
          <footer className="mt-12 text-center">
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground"
              onClick={actions.forget}
            >
              {vm.forget.label}
            </Button>
          </footer>
        )}
      </>
    );
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>
          <h1>{vm.title}</h1>
        </CardTitle>
        <CardDescription>{vm.description}</CardDescription>
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
            <Label htmlFor={vm.field.id}>{vm.field.label}</Label>
            <Input
              id={vm.field.id}
              type="password"
              autoComplete="current-password"
              required={vm.field.required}
              value={vm.field.value}
              onChange={(e) => actions.setDraft(e.target.value)}
            />
          </div>
          {vm.error && (
            <Alert variant="destructive">
              <AlertDescription>{vm.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={vm.submit.disabled}>
            {vm.submit.label}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
