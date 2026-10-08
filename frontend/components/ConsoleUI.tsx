// Shared building blocks for console pages. Styles live in app/console.css
// (nfc-* classes) so pages stop carrying their own inline layouts.
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="nfc-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="nfc-head-actions">{actions}</div>}
    </header>
  );
}

export interface KpiItem {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

/** One row of headline numbers separated by hairlines. */
export function KpiBand({ items }: { items: KpiItem[] }) {
  return (
    <section className="nfc-kpis" style={{ ["--nfc-kpi-cols" as string]: String(items.length) }}>
      {items.map((item, index) => (
        <div className="nfc-kpi" key={index}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint !== undefined && <small>{item.hint}</small>}
        </div>
      ))}
    </section>
  );
}

export function Panel({ title, aside, children, flush, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`nfc-panel${className ? ` ${className}` : ""}`}>
      {(title || aside) && (
        <div className="nfc-panel-head">
          {title && <h2>{title}</h2>}
          {aside && <div className="nfc-panel-aside">{aside}</div>}
        </div>
      )}
      <div className={flush ? "nfc-panel-flush" : "nfc-panel-body"}>{children}</div>
    </section>
  );
}

export type TagTone = "neutral" | "positive" | "negative" | "warning" | "accent";

export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`nfc-tag nfc-tag-${tone}`}>{children}</span>;
}

/** Local time as "10-08 14:23" (adds the year only when it differs). */
export function formatConsoleTime(value: string | number | Date, withSeconds = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = `${sameYear ? "" : `${date.getFullYear()}-`}${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}${withSeconds ? `:${pad(date.getSeconds())}` : ""}`;
  return `${day} ${time}`;
}
