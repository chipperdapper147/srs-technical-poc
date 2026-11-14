import type { TextFieldVM } from "../core/fields.ts";
import type { AccessScreenState } from "./controller.ts";

export type AccessVM =
  | { kind: "open"; forget: { label: string } | null }
  | {
      kind: "locked";
      title: string;
      description: string;
      field: TextFieldVM;
      submit: { label: string; disabled: boolean };
      error: string | null;
    };

export function accessViewModel({ locked, rejected, hasKey, draft }: AccessScreenState): AccessVM {
  if (!locked) return { kind: "open", forget: hasKey ? { label: "Forget access key" } : null };
  return {
    kind: "locked",
    title: "Access key",
    description:
      "This deployment is private for now. Enter the access key to continue; this browser remembers it.",
    field: { id: "access-key", label: "Access key", value: draft, required: true },
    submit: { label: "Continue", disabled: draft.trim() === "" },
    error: rejected ? "That key didn't work. Check it and try again." : null,
  };
}
