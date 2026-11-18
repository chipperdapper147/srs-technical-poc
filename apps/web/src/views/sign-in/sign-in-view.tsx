import type { AuthActions, SignInVM } from "@app/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Signed out: both ways in continue on Auth0's sign-in page. */
export function SignInView({ vm, actions }: { vm: SignInVM; actions: AuthActions }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>
          <h1>{vm.title}</h1>
        </CardTitle>
        <CardDescription>{vm.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {vm.error && (
          <Alert variant="destructive">
            <AlertDescription>{vm.error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Button disabled={vm.google.disabled} onClick={() => actions.signIn("google")}>
            {vm.google.label}
          </Button>
          <Button
            variant="secondary"
            disabled={vm.email.disabled}
            onClick={() => actions.signIn("email")}
          >
            {vm.email.label}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
