"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartConfig, QueryResponse } from "@/types";

const COLORS = [
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

const KPI_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee"];

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (Math.abs(value) >= 10_000_000) return `Rs ${(value / 10_000_000).toFixed(2)} Cr`;
    if (Math.abs(value) >= 100_000) return `Rs ${(value / 100_000).toFixed(1)} L`;
    if (Math.abs(value) >= 1_000) return `Rs ${(value / 1_000).toFixed(1)} K`;
    return String(Math.round(value * 100) / 100);
  }
  return String(value);
}

function formatTick(value: unknown): string {
  if (typeof value === "number") {
    if (Math.abs(value) >= 100_000) return `${(value / 100_000).toFixed(0)}L`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return String(value);
  }
  const text = String(value);
  return text.length > 12 ? `${text.slice(0, 12)}...` : text;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: unknown; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 shadow-2xl">
      {label && <p className="mb-2 text-xs font-medium text-slate-400">{label}</p>}
      {payload.map((item, index) => (
        <div key={`${item.name}-${index}`} className="flex items-center gap-2 text-sm">
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: item.color || COLORS[index % COLORS.length] }}
          />
          <span className="text-slate-300">{item.name}:</span>
          <span className="font-semibold text-white">{formatValue(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return null;
  const entries = Object.entries(data[0]).filter(([, value]) => value !== null);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {entries.map(([key, value], index) => (
        <div key={key} className="rounded-2xl border border-white/8 bg-[#22201d] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {labelize(key)}
          </p>
          <p className="text-3xl font-semibold text-white" style={{ color: KPI_COLORS[index % KPI_COLORS.length] }}>
            {formatValue(value)}
          </p>
          <p className="mt-2 text-xs text-slate-500">Live metric from query result</p>
        </div>
      ))}
    </div>
  );
}

function getKeys(data: Record<string, unknown>[], config: ChartConfig) {
  const keys = Object.keys(data[0] || {});
  return {
    xKey: config.x || keys[0] || "x",
    yKey: config.y || keys[1] || "y",
  };
}

function LineChartComponent({
  data,
  config,
  isArea = false,
}: {
  data: Record<string, unknown>[];
  config: ChartConfig;
  isArea?: boolean;
}) {
  const { xKey, yKey } = getKeys(data, config);
  const Chart = isArea ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <Chart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={formatTick}
          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={formatTick}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip content={<CustomTooltip />} />
        {isArea ? (
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={COLORS[1]}
            strokeWidth={2.5}
            fill={`${COLORS[1]}24`}
            dot={{ fill: COLORS[1], r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: COLORS[1] }}
          />
        ) : (
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={COLORS[1]}
            strokeWidth={2.5}
            dot={{ fill: COLORS[1], r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: COLORS[1] }}
          />
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

function BarChartComponent({ data, config }: { data: Record<string, unknown>[]; config: ChartConfig }) {
  const { xKey, yKey } = getKeys(data, config);
  const isHorizontal = data.length > 5;

  if (isHorizontal) {
    return (
    <ResponsiveContainer width="100%" height={Math.max(260, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 86, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={formatTick}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey={xKey}
            type="category"
            tick={{ fill: "#cbd5e1", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={84}
            tickFormatter={(value) => String(value).slice(0, 14)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey={yKey} radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
          tickLine={false}
          tickFormatter={(value) => String(value).slice(0, 12)}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={formatTick}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieChartComponent({
  data,
  config,
  isDonut = false,
}: {
  data: Record<string, unknown>[];
  config: ChartConfig;
  isDonut?: boolean;
}) {
  const { xKey, yKey } = getKeys(data, config);
  const total = data.reduce((sum, row) => sum + Number(row[yKey] || 0), 0);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <ResponsiveContainer width={240} height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={isDonut ? 62 : 0}
            outerRadius={92}
            dataKey={yKey}
            nameKey={xKey}
            paddingAngle={isDonut ? 2 : 0}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              const percent = total ? ((Number(item.value) / total) * 100).toFixed(1) : "0.0";
              return (
                <div className="rounded-lg border border-white/10 bg-[#11151b] p-3 text-sm shadow-2xl">
                  <p className="font-semibold text-white">{String(item.name)}</p>
                  <p className="text-slate-300">
                    {formatValue(item.value)} ({percent}%)
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex min-w-[160px] flex-1 flex-col gap-2">
        {data.slice(0, 8).map((row, index) => {
          const percent = total ? ((Number(row[yKey]) / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={index} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-300">{String(row[xKey])}</span>
              <span className="text-xs text-slate-500">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScatterChartComponent({ data, config }: { data: Record<string, unknown>[]; config: ChartConfig }) {
  const { xKey, yKey } = getKeys(data, config);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={formatTick}
          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
          tickLine={false}
        />
        <YAxis
          dataKey={yKey}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={formatTick}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip content={<CustomTooltip />} />
        <Scatter data={data} fill={COLORS[2]} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-[#22201d] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ResultsTable({ data }: { data: Record<string, unknown>[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {Object.keys(data[0]).map((column) => (
              <th
                key={column}
                className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-slate-400"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-white/5">
              {Object.values(row).map((value, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4 text-slate-300">
                  {formatValue(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ChartRenderer({ response }: { response: QueryResponse }) {
  const { data, charts, error } = response;

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-slate-400">
        No data returned.
      </div>
    );
  }

  const kpiCharts = charts.filter((config) => config.type === "kpi");
  const visualCharts = charts.filter((config) => config.type !== "kpi");
  const heroChart = visualCharts[0];
  const secondaryCharts = visualCharts.slice(1);

  return (
    <div className="space-y-5">
      {kpiCharts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4 border-b border-white/8 pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Performance Snapshot</p>
              <h3 className="mt-1 text-3xl font-semibold text-white">
                {kpiCharts.length === 1 ? kpiCharts[0].title : "Key Metrics"}
              </h3>
            </div>
          </div>
          <KpiCard data={data} />
        </section>
      )}

      {heroChart && (
        <ChartPanel title={heroChart.title} description={heroChart.description}>
          {heroChart.type === "line" && <LineChartComponent data={data} config={heroChart} />}
          {heroChart.type === "area" && <LineChartComponent data={data} config={heroChart} isArea />}
          {heroChart.type === "bar" && <BarChartComponent data={data} config={heroChart} />}
          {heroChart.type === "pie" && <PieChartComponent data={data} config={heroChart} />}
          {heroChart.type === "donut" && <PieChartComponent data={data} config={heroChart} isDonut />}
          {heroChart.type === "scatter" && <ScatterChartComponent data={data} config={heroChart} />}
        </ChartPanel>
      )}

      {secondaryCharts.length > 0 && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {secondaryCharts.map((config, index) => {
            return (
              <ChartPanel key={index} title={config.title} description={config.description}>
                {config.type === "line" && <LineChartComponent data={data} config={config} />}
                {config.type === "area" && <LineChartComponent data={data} config={config} isArea />}
                {config.type === "bar" && <BarChartComponent data={data} config={config} />}
                {config.type === "pie" && <PieChartComponent data={data} config={config} />}
                {config.type === "donut" && <PieChartComponent data={data} config={config} isDonut />}
                {config.type === "scatter" && <ScatterChartComponent data={data} config={config} />}
              </ChartPanel>
            );
          })}
        </div>
      )}

      {charts.length === 0 && (
        <ChartPanel title="Query Results">
          <ResultsTable data={data} />
        </ChartPanel>
      )}
    </div>
  );
}
