import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Loading() {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
