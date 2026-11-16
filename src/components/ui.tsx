import { useEffect, useRef, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  LoaderCircle,
  X,
} from "lucide-react";
import type { Application, Status } from "../types";
export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <span
      className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      <span />
      {status}
    </span>
  );
}
export function Company({ a }: { a: Application }) {
  return (
    <div className="company-cell">
      <span className={"company-logo logo-" + (a.company.charCodeAt(0) % 5)}>
        {a.company.slice(0, 1)}
      </span>
      <span>
        <strong>{a.company}</strong>
        <small>{a.role}</small>
      </span>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <BriefcaseBusiness size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={23} /> Loading your workspace…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div className="error-panel" role="alert">
      <AlertCircle size={23} />
      <h3>We couldn’t load this page</h3>
      <p>{error.message}</p>
      <button className="btn secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Toast({
  message,
  close,
}: {
  message: string;
  close: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(close, 4500);
    return () => clearTimeout(timer);
  }, [message, close]);
  return (
    <div role="status" className="toast">
      <Check size={18} />
      {message}
      <button aria-label="Dismiss notification" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
export const Arrow = () => <ArrowUpRight size={16} />;
export const formatDate = (s: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(s));
