import type { ReactNode } from "react";

export function Placeholder({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <section className="placeholder-view">
      {icon}
      <h2>{title}</h2>
    </section>
  );
}
