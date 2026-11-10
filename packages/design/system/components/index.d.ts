// SRS components (window.SRS). Documentation, not type-checked: shapes copied from
// apps/web/src/components (shadcn base-nova on Base UI). React 18/19 types.
import type * as React from "react";

type Div = React.ComponentProps<"div">;

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}
export declare function Button(props: ButtonProps): React.JSX.Element;

export interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  /** Base UI: render as another element. */
  render?: React.ReactElement;
}
export declare function Badge(props: BadgeProps): React.JSX.Element;

export interface CardProps extends Div {
  size?: "default" | "sm";
}
export declare function Card(props: CardProps): React.JSX.Element;
export declare function CardHeader(props: Div): React.JSX.Element;
export declare function CardTitle(props: Div): React.JSX.Element;
export declare function CardDescription(props: Div): React.JSX.Element;
export declare function CardAction(props: Div): React.JSX.Element;
export declare function CardContent(props: Div): React.JSX.Element;
export declare function CardFooter(props: Div): React.JSX.Element;

export interface AlertProps extends Div {
  variant?: "default" | "destructive";
}
export declare function Alert(props: AlertProps): React.JSX.Element;
export declare function AlertTitle(props: Div): React.JSX.Element;
export declare function AlertDescription(props: Div): React.JSX.Element;
export declare function AlertAction(props: Div): React.JSX.Element;

export interface ProgressProps extends Div {
  /** 0–100. */
  value: number | null;
  /** Required in this system: progress bars must have an accessible name. */
  "aria-label": string;
}
export declare function Progress(props: ProgressProps): React.JSX.Element;
export declare function ProgressLabel(props: Div): React.JSX.Element;
export declare function ProgressValue(props: Div): React.JSX.Element;

export type InputProps = React.ComponentProps<"input">;
export declare function Input(props: InputProps): React.JSX.Element;

export type TextareaProps = React.ComponentProps<"textarea">;
export declare function Textarea(props: TextareaProps): React.JSX.Element;

export type LabelProps = React.ComponentProps<"label">;
export declare function Label(props: LabelProps): React.JSX.Element;

export type NativeSelectProps = React.ComponentProps<"select">;
export declare function NativeSelect(props: NativeSelectProps): React.JSX.Element;

export interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  size?: "default" | "sm";
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
export declare function Switch(props: SwitchProps): React.JSX.Element;
