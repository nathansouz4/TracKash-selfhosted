import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import type { Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

/** Anything that reveals money. Blurred in privacy mode (see styles.css). */
export function Sensitive({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("sensitive", className)}>{children}</span>;
}

export function Money({
  value,
  className,
  tone,
}: {
  value: number | null | undefined;
  className?: string;
  tone?: Tone | undefined;
}) {
  return (
    <span
      className={cn(
        "sensitive tabular",
        tone === "positive" && "text-positive",
        tone === "negative" && "text-negative",
        className,
      )}
    >
      {formatBRL(value)}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Card with the small uppercase icon header used across the app. */
export function SectionCard({
  icon: Icon,
  title,
  value,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  icon: LucideIcon;
  title: string;
  value?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string | undefined;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      <header className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
            {title}
          </h2>
          {actions}
        </div>
        {value != null ? (
          <div className="mt-2 text-2xl font-bold tracking-tight sm:text-[1.75rem]">{value}</div>
        ) : null}
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children != null ? (
        <div className={cn("flex-1 border-t", bodyClassName)}>{children}</div>
      ) : null}
    </section>
  );
}

export function StatTile({
  label,
  value,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  delta?: { text: string; tone: Tone } | undefined;
  hint?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-xs">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {Icon ? <Icon className="h-4 w-4 text-brand" aria-hidden="true" /> : null}
        {label}
      </p>
      <div className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</div>
      {delta ? (
        <p
          className={cn(
            "tabular mt-1 text-sm",
            delta.tone === "positive" && "text-positive",
            delta.tone === "negative" && "text-negative",
            delta.tone === "neutral" && "text-muted-foreground",
          )}
        >
          {delta.tone === "positive" ? "▲ " : delta.tone === "negative" ? "▼ " : ""}
          {delta.text}
        </p>
      ) : null}
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * A chart with its title and an always-available table view, so values never
 * depend on color or hover alone.
 */
export function ChartCard({
  icon,
  title,
  description,
  actions,
  children,
  table,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] } | undefined;
  className?: string;
}) {
  return (
    <SectionCard
      icon={icon}
      title={title}
      subtitle={description}
      actions={actions}
      className={className}
      bodyClassName="px-5 py-4"
    >
      {children}
      {table && table.rows.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver tabela
          </summary>
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="tabular w-full text-left">
              <thead>
                <tr className="border-b text-muted-foreground">
                  {table.columns.map((c, i) => (
                    <th key={c} className={cn("py-1 font-normal", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b last:border-0">
                    {row.map((cell, i) => (
                      <td key={i} className={cn("py-1", i > 0 && "sensitive text-right")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{children}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Bank logo from Pluggy, with an initial as fallback. */
export function InstitutionAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  return imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      referrerPolicy="no-referrer"
      className={cn(
        "h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-border",
        className,
      )}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Usage meter: the fill carries severity, the track is a lighter step. */
export function UsageMeter({ ratio, label }: { ratio: number; label: string }) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const color =
    clamped >= 0.8 ? "var(--negative)" : clamped >= 0.5 ? "var(--warning)" : "var(--brand)";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${clamped * 100}%`, background: color }}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-xs"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            o.value === value && "bg-card text-foreground shadow-xs ring-1 ring-border",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
