import type { ReactNode } from "react";

export function Placeholder({ title, detail, icon }: { title: string; detail?: string; icon: ReactNode }) {
  return (
    <section className="placeholder-view">
      <div className="placeholder-content">
        <span className="placeholder-icon">{icon}</span>
        <h2>{title}</h2>
        <p>{detail ?? "This area is coming soon."}</p>
      </div>
    </section>
  );
}
