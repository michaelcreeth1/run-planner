import type { ReactNode } from "react";

export function StatusBanner({
  tone,
  icon,
  title,
  detail,
  actionLabel,
  onAction
}: {
  tone: "warning" | "danger" | "success";
  icon: ReactNode;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className={`status-banner ${tone}`} role="status">
      {icon}
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {actionLabel && onAction ? (
        <button className="status-banner-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
