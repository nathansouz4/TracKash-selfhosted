import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatBRL,
  formatBRLCompact,
  formatDateBR,
  monthLongLabel,
  monthShortLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";

// Chart specs: thin bars (<= 24px) with 4px rounded data ends, 2px lines,
// hairline solid grid, muted axis text, a tooltip on every chart. Text never
// takes the series color.

const AXIS_TICK = { fill: "var(--chart-label)", fontSize: 12 };
const AXIS_LINE = { stroke: "var(--chart-axis)" };

type TooltipRow = { label: string; value: string };

function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="tabular text-muted-foreground">
          {row.label}: <span className="text-popover-foreground">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

type TooltipProps = { active?: boolean; payload?: readonly { payload?: unknown }[] };

// ---------------------------------------------------------------------------
// Monthly columns (spending, contributions, dividends)
// ---------------------------------------------------------------------------

export function MonthlyColumns({
  data,
  highlight,
  valueLabel,
  height = 240,
  onSelect,
}: {
  data: { month: string; total: number }[];
  /** Month drawn in the accent color; the others are de-emphasized. Defaults to the last one. */
  highlight?: string;
  valueLabel: string;
  height?: number;
  onSelect?: (month: string) => void;
}) {
  const accent = highlight ?? data.at(-1)?.month;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="month"
          tickFormatter={monthShortLabel}
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatBRLCompact}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          cursor={{ fill: "var(--series-wash)" }}
          content={({ active, payload }: TooltipProps) => {
            const row = active
              ? (payload?.[0]?.payload as { month: string; total: number } | undefined)
              : undefined;
            return row ? (
              <TooltipBox
                title={monthLongLabel(row.month)}
                rows={[{ label: valueLabel, value: formatBRL(row.total) }]}
              />
            ) : null;
          }}
        />
        <Bar
          dataKey="total"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
          {...(onSelect
            ? {
                cursor: "pointer",
                onClick: (entry: { payload?: { month?: string } }) =>
                  entry.payload?.month && onSelect(entry.payload.month),
              }
            : {})}
        >
          {data.map((d) => (
            <Cell
              key={d.month}
              fill={d.month === accent ? "var(--series-1)" : "var(--series-muted)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Ranked horizontal bars (categories, merchants, allocation)
// ---------------------------------------------------------------------------

export function RankedBars({
  data,
  valueLabel,
  formatValue = formatBRL,
  secondary,
}: {
  data: { label: string; total: number }[];
  valueLabel: string;
  formatValue?: (value: number) => string;
  /** Optional right-hand annotation per row (e.g. share of total). */
  secondary?: (row: { label: string; total: number }) => string;
}) {
  const max = Math.max(...data.map((d) => d.total), 0);
  // Plain HTML bars: labels never collide or get clipped, and they read as a table.
  return (
    <ul className="space-y-3" aria-label={valueLabel}>
      {data.map((row) => (
        <li key={row.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{row.label}</span>
            <span className="tabular shrink-0 text-muted-foreground">
              <span className="sensitive text-foreground">{formatValue(row.total)}</span>
              {secondary ? <span className="ml-2">{secondary(row)}</span> : null}
            </span>
          </div>
          <div className="h-2.5 w-full">
            <div
              className="h-full rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{
                width: `${max > 0 ? Math.max((row.total / max) * 100, 0.5) : 0}%`,
                background: "var(--series-1)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Value over time (portfolio)
// ---------------------------------------------------------------------------

export function ValueArea({
  data,
  valueLabel,
  formatValue = formatBRL,
  formatTick = formatBRLCompact,
  height = 240,
  monthly = false,
}: {
  /** `date` is YYYY-MM-DD, or YYYY-MM when `monthly`. */
  data: { date: string; value: number }[];
  valueLabel: string;
  formatValue?: (value: number) => string;
  formatTick?: (value: number) => string;
  height?: number;
  monthly?: boolean;
}) {
  const formatX = monthly ? monthShortLabel : (d: string) => formatDateBR(d).slice(0, 5);
  const formatTitle = monthly ? monthLongLabel : formatDateBR;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatX}
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={formatTick}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={72}
          domain={["auto", "auto"]}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }: TooltipProps) => {
            const row = active
              ? (payload?.[0]?.payload as { date: string; value: number } | undefined)
              : undefined;
            return row ? (
              <TooltipBox
                title={formatTitle(row.date)}
                rows={[{ label: valueLabel, value: formatValue(row.value) }]}
              />
            ) : null;
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill="var(--series-wash)"
          fillOpacity={1}
          dot={
            data.length <= 2
              ? { r: 4, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }
              : false
          }
          activeDot={{
            r: 5,
            fill: "var(--series-1)",
            stroke: "var(--chart-surface)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Stacked monthly columns (income by type) and a 100% split bar
// ---------------------------------------------------------------------------

export type SeriesDef = { key: string; label: string; color: string };

function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: s.color }}
            aria-hidden="true"
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export function StackedMonthlyColumns({
  data,
  series,
  height = 260,
}: {
  data: ({ month: string } & Record<string, number | string>)[];
  series: SeriesDef[];
  height?: number;
}) {
  return (
    <>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="month"
            tickFormatter={monthShortLabel}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatBRLCompact}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            cursor={{ fill: "var(--series-wash)" }}
            content={({ active, payload }: TooltipProps) => {
              const row = active
                ? (payload?.[0]?.payload as Record<string, number | string> | undefined)
                : undefined;
              if (!row) return null;
              const rows = series
                .filter((s) => Number(row[s.key] ?? 0) > 0)
                .map((s) => ({ label: s.label, value: formatBRL(Number(row[s.key])) }));
              const total = series.reduce((sum, s) => sum + Number(row[s.key] ?? 0), 0);
              return (
                <TooltipBox
                  title={monthLongLabel(String(row["month"]))}
                  rows={[...rows, { label: "Total", value: formatBRL(total) }]}
                />
              );
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="stack"
              fill={s.color}
              maxBarSize={24}
              stroke="var(--chart-surface)"
              strokeWidth={1}
              isAnimationActive={false}
              {...(i === series.length - 1
                ? { radius: [4, 4, 0, 0] as [number, number, number, number] }
                : {})}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

/** Part-to-whole in one 100% bar, with a legend that carries the values. */
export function SplitBar({
  data,
  formatValue = formatBRL,
}: {
  data: { label: string; total: number; share: number }[];
  formatValue?: (value: number) => string;
}) {
  const colors = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
  return (
    <div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label="Distribuição"
      >
        {data.map((d, i) => (
          <div
            key={d.label}
            style={{ width: `${d.share * 100}%`, background: colors[i % colors.length] }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: colors[i % colors.length] }}
                aria-hidden="true"
              />
              {d.label}
            </span>
            <span className="tabular text-muted-foreground">
              <span className="sensitive text-foreground">{formatValue(d.total)}</span>{" "}
              {(d.share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut (part-to-whole) with a legend that carries labels, values and shares
// ---------------------------------------------------------------------------

const CATEGORICAL = Array.from({ length: 8 }, (_, i) => `var(--cat-${i + 1})`);

type Slice = { label: string; total: number; share: number };

/** Keeps at most `max` slices: the largest ones plus "Outros" (the palette has 8 slots). */
function foldSlices(data: Slice[], max: number): Slice[] {
  const sorted = [...data].filter((d) => d.total > 0);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);
  return [
    ...head,
    {
      label: "Outros",
      total: tail.reduce((s, d) => s + d.total, 0),
      share: tail.reduce((s, d) => s + d.share, 0),
    },
  ];
}

export function DonutChart({
  data,
  centerLabel,
  formatValue = formatBRL,
  colorOrder,
  size = 176,
}: {
  data: Slice[];
  centerLabel: string;
  formatValue?: (value: number) => string;
  /** Fixed label order for colors, so a category keeps its color as values change. */
  colorOrder?: readonly string[] | undefined;
  size?: number;
}) {
  // Hover lives in the center of the ring (not a floating tooltip), so it never
  // covers the total or the legend. Hovering a legend row does the same.
  const [active, setActive] = useState<number | null>(null);
  const slices = foldSlices(data, 8);
  const total = slices.reduce((s, d) => s + d.total, 0);
  const colorOf = (label: string, index: number) => {
    const fixed = colorOrder?.indexOf(label) ?? -1;
    return CATEGORICAL[(fixed >= 0 ? fixed : index) % CATEGORICAL.length]!;
  };

  if (slices.length === 0) return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  const focus = active != null ? slices[active] : undefined;

  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @sm:flex-row @sm:items-center">
        <div
          className="relative shrink-0"
          style={{ width: size, height: size }}
          onMouseLeave={() => setActive(null)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="total"
                nameKey="label"
                innerRadius="64%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="var(--chart-surface)"
                strokeWidth={2}
                isAnimationActive={false}
                onMouseEnter={(_: unknown, index: number) => setActive(index)}
              >
                {slices.map((d, i) => (
                  <Cell
                    key={d.label}
                    fill={colorOf(d.label, i)}
                    fillOpacity={active == null || active === i ? 1 : 0.35}
                    style={{ cursor: "pointer", transition: "fill-opacity 120ms" }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
            aria-live="polite"
          >
            <span className="line-clamp-2 text-[11px] leading-tight tracking-wide text-muted-foreground uppercase">
              {focus ? focus.label : centerLabel}
            </span>
            <span className="sensitive tabular mt-0.5 text-sm font-bold">
              {formatValue(focus ? focus.total : total)}
            </span>
            {focus ? (
              <span className="tabular text-xs text-muted-foreground">
                {formatPercentShare(focus.share)}
              </span>
            ) : null}
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-0.5 text-sm" onMouseLeave={() => setActive(null)}>
          {slices.map((d, i) => (
            <li
              key={d.label}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-1.5 py-1 transition-colors",
                active === i && "bg-accent",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: colorOf(d.label, i) }}
                  aria-hidden="true"
                />
                <span className="truncate">{d.label}</span>
              </span>
              <span className="tabular shrink-0 text-muted-foreground">
                <span className="sensitive text-foreground">{formatValue(d.total)}</span>{" "}
                <span className="inline-block w-12 text-right">{formatPercentShare(d.share)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatPercentShare(share: number): string {
  return `${(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ---------------------------------------------------------------------------
// Radar (scores 0–100 on a few named axes, e.g. portfolio health)
// ---------------------------------------------------------------------------

export function ScoreRadar({
  data,
  label,
  height = 300,
}: {
  data: { axis: string; score: number }[];
  label: string;
  height?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          data={data}
          outerRadius="72%"
          margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
        >
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--chart-label)", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={false} axisLine={false} />
          <Radar
            dataKey="score"
            name={label}
            stroke="var(--cat-1)"
            strokeWidth={2}
            fill="var(--cat-1)"
            fillOpacity={0.28}
            dot={{ r: 4, fill: "var(--cat-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }: TooltipProps) => {
              const row = active
                ? (payload?.[0]?.payload as { axis: string; score: number })
                : null;
              return row ? (
                <TooltipBox
                  title={row.axis}
                  rows={[{ label: "Nota", value: `${row.score} de 100` }]}
                />
              ) : null;
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
