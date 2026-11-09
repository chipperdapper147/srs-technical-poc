/** View-model shapes for form controls, shared by every screen. */

export interface TextFieldVM {
  /** Stable id for label association (web) and test lookup. */
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
}

export interface SelectVM<T extends string = string> {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
}

/** Help text with inline code, e.g. ["Use ", { code: "es" }, " codes"]. */
export type RichText = (string | { code: string })[];

export interface ProgressVM {
  /** 0–100. */
  value: number;
  label: string;
}
