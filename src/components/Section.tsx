import type { ReactNode } from "react";

export default function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-sm font-medium uppercase tracking-widest text-violet-400">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-3 max-w-2xl text-zinc-400">{subtitle}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
