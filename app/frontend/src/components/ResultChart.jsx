import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const PALETTE = ["#2563EB", "#64748B", "#3B82F6", "#1E40AF", "#93C5FD", "#0EA5E9", "#7C3AED"];

const axisStyle = { fontSize: 12, fill: "#64748B", fontFamily: "Inter, sans-serif" };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-semibold text-slate-900">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs text-slate-600">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="font-medium text-slate-700">{p.dataKey}</span>
          <span className="ml-auto font-mono text-slate-900">{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

export const ResultChart = ({ chart, testId }) => {
  if (!chart || !chart.data || chart.data.length === 0) {
    return (
      <div
        data-testid={testId}
        className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400"
      >
        No chart data
      </div>
    );
  }

  const { type, x_key, series = [], data } = chart;
  const isLine = type === "line";

  return (
    <div data-testid={testId} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {isLine ? (
          <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
            <XAxis dataKey={x_key} tick={axisStyle} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} unit="%" width={48} />
            <Tooltip content={<CustomTooltip />} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2.5}
                dot={{ r: 2.5, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
            <XAxis dataKey={x_key} tick={axisStyle} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} unit="%" width={48} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F1F5F9" }} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} maxBarSize={56} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ResultChart;
