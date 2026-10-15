import type { ComponentProps, ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";

// Card anatomy adapted from Watermelon UI's MIT card primitive.
// https://registry.watermelon.sh/r/card.json — see THIRD_PARTY_NOTICES.md.
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={`card ${className}`} {...props} />;
}
export function CardHeader({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={`card-header ${className}`}
      {...props}
    />
  );
}
export function CardTitle({ className = "", ...props }: ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={className} {...props} />;
}
export function CardDescription({
  className = "",
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={`muted ${className}`}
      {...props}
    />
  );
}
export function CardContent({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return <div data-slot="card-content" className={className} {...props} />;
}
export function CardFooter({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={`card-footer ${className}`}
      {...props}
    />
  );
}
export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      disabled={busy || disabled}
      {...props}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={`modal ${wide ? "wide" : ""}`}
          aria-describedby={description ? "modal-description" : undefined}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="modal-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Pill({ status }: { status: string }) {
  return <span className={`pill ${status.toLowerCase()}`}>{status}</span>;
}
