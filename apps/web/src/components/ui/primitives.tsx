import type { ComponentProps } from "react";

// Native components styled with the Button/Input/Card conventions of shadcn/ui.
// CSS is kept local to match this project's existing styling setup.
export function Button({
  className = "",
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<"button"> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "icon";
}) {
  return (
    <button
      data-slot="button"
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`}
      {...props}
    />
  );
}
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input data-slot="input" className={`ui-input ${className}`} {...props} />
  );
}
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={`ui-card ${className}`} {...props} />;
}
