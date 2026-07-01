import type { ReactNode } from "react";

export function StatusBanner({
  tone,
  icon,
  title,
  detail
}: {
  tone: "warning" | "danger";
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <section className={`status-banner ${tone}`} role="status">
      {icon}
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </section>
  );
}
