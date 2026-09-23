import { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Code2, Copy, Check, ChevronDown, Table2, BarChart3, LineChart, Download, TrendingUp, TrendingDown, Layers, Share2 } from "lucide-react";
import { toast } from "sonner";
import ResultChart from "@/components/ResultChart";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const CopilotMessage = ({ msg, index, euAggregate }) => {
  const [showSql, setShowSql] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [euMap, setEuMap] = useState(null);
  const [overlayLoading, setOverlayLoading] = useState(false);

  const baseChart = msg.chart;
  const isLine = baseChart?.type === "line";
  const isYearLine = isLine && baseChart?.x_key === "year";
  const canOverlay =
    isYearLine &&
    euAggregate &&
    baseChart.series?.length === 1 &&
    baseChart.series[0] !== euAggregate.entity;

  const ensureEu = async () => {
    const years = baseChart.data.map((d) => d[baseChart.x_key]).filter((y) => typeof y === "number");
    const { data } = await axios.get(`${API}/series`, {
      params: { codes: euAggregate.country_code, start: Math.min(...years), end: Math.max(...years) },
    });
    const map = {};
    data.rows.forEach((r) => (map[r.year] = r.youth_unemployment_rate));
    setEuMap(map);
    return map;
  };

  // Auto-load EU average for the gap badge on single-country trends.
  useEffect(() => {
    if (canOverlay && !euMap) ensureEu().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOverlay]);

  const gap = useMemo(() => {
    if (!canOverlay || !euMap) return null;
    const s = baseChart.series[0];
    const pts = baseChart.data
      .filter((d) => typeof d[s] === "number" && euMap[d[baseChart.x_key]] != null)
      .map((d) => ({ year: d[baseChart.x_key], diff: d[s] - euMap[d[baseChart.x_key]] }));
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    return { year: last.year, diff: last.diff, country: s };
  }, [canOverlay, euMap, baseChart]);

  const displayChart = useMemo(() => {
    if (!overlay || !euMap) return baseChart;
    const name = euAggregate.entity;
    return {
      ...baseChart,
      series: [...baseChart.series, name],
      data: baseChart.data.map((d) => ({ ...d, [name]: euMap[d[baseChart.x_key]] ?? null })),
    };
  }, [overlay, euMap, baseChart, euAggregate]);

  const trend = useMemo(() => {
    const c = displayChart;
    if (c?.type !== "line" || !c.data?.length || !c.series?.length) return null;
    let rise = null;
    let fall = null;
    for (const s of c.series) {
      const pts = c.data.filter((d) => typeof d[s] === "number").map((d) => ({ x: d[c.x_key], y: d[s] }));
      for (let i = 1; i < pts.length; i++) {
        const delta = pts[i].y - pts[i - 1].y;
        if (rise === null || delta > rise.delta) rise = { delta, s, from: pts[i - 1].x, to: pts[i].x };
        if (fall === null || delta < fall.delta) fall = { delta, s, from: pts[i - 1].x, to: pts[i].x };
      }
    }
    if (!rise && !fall) return null;
    return { rise, fall, multi: c.series.length > 1 };
  }, [displayChart]);

  const copySql = () => {
    navigator.clipboard.writeText(msg.sql);
    setCopied(true);
    toast.success("SQL copied to clipboard");
    setTimeout(() => setCopied(false), 1600);
  };

  const share = () => {
    const url = `${window.location.origin}${window.location.pathname}?m=${msg.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Shareable link copied");
  };

  const downloadCsv = () => {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [msg.columns.join(","), ...msg.rows.map((r) => msg.columns.map((c) => esc(r[c])).join(","))];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eu-copilot-result-${index}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const toggleOverlay = async () => {
    if (overlay) {
      setOverlay(false);
      return;
    }
    if (!euMap) {
      try {
        setOverlayLoading(true);
        await ensureEu();
      } catch (e) {
        toast.error("Could not load the EU average overlay.");
        setOverlayLoading(false);
        return;
      }
      setOverlayLoading(false);
    }
    setOverlay(true);
  };

  const fmt = (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      data-testid={`copilot-message-${index}`}
      className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
    >
      {/* answer */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1E40AF]">
          {isLine ? <LineChart className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-base leading-relaxed text-slate-700">{msg.answer}</p>
          {gap && Math.abs(gap.diff) >= 0.05 && (
            <span
              data-testid={`gap-badge-${index}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                gap.diff > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {gap.diff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {fmt(gap.diff)} pp vs EU average
              <span className="font-normal opacity-70">({gap.year})</span>
            </span>
          )}
        </div>
      </div>

      {/* trend insight callout */}
      {trend && (
        <div
          data-testid={`trend-insight-${index}`}
          className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs"
        >
          {trend.rise && trend.rise.delta > 0 && (
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <TrendingUp className="h-3.5 w-3.5 text-rose-500" />
              <span className="font-medium text-slate-800">Biggest rise</span>
              <span className="font-mono text-rose-600">{fmt(trend.rise.delta)} pp</span>
              {trend.multi && <span className="text-slate-500">· {trend.rise.s}</span>}
              <span className="text-slate-400">({trend.rise.from}→{trend.rise.to})</span>
            </span>
          )}
          {trend.fall && trend.fall.delta < 0 && (
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium text-slate-800">Sharpest fall</span>
              <span className="font-mono text-emerald-700">{fmt(trend.fall.delta)} pp</span>
              {trend.multi && <span className="text-slate-500">· {trend.fall.s}</span>}
              <span className="text-slate-400">({trend.fall.from}→{trend.fall.to})</span>
            </span>
          )}
        </div>
      )}

      {/* chart */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:p-4">
        <ResultChart chart={displayChart} testId={`chart-container-${index}`} />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <button
          data-testid={`sql-toggle-btn-${index}`}
          onClick={() => setShowSql((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#1E40AF]"
        >
          <Code2 className="h-3.5 w-3.5" />
          {showSql ? "Hide SQL" : "View Generated SQL"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSql ? "rotate-180" : ""}`} />
        </button>
        {canOverlay && (
          <button
            data-testid={`eu-overlay-btn-${index}`}
            onClick={toggleOverlay}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              overlay
                ? "border-[#1E40AF] bg-[#EFF6FF] text-[#1E40AF]"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#1E40AF]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {overlayLoading ? "Loading…" : overlay ? "Hide EU average" : "Overlay EU average"}
          </button>
        )}
        {msg.rows?.length > 0 && (
          <button
            data-testid={`csv-export-btn-${index}`}
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#1E40AF]"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
        <button
          data-testid={`share-btn-${index}`}
          onClick={share}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#1E40AF]"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
        {msg.rows?.length > 0 && (
          <button
            data-testid={`table-toggle-btn-${index}`}
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#1E40AF]"
          >
            <Table2 className="h-3.5 w-3.5" />
            {showTable ? "Hide rows" : `View ${msg.rows.length} rows`}
          </button>
        )}
        <span className="ml-auto font-mono text-[11px] text-slate-400">gemini-3-flash · text-to-SQL</span>
      </div>

      {/* sql block */}
      {showSql && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Generated SQL</span>
            <button
              data-testid={`sql-copy-btn-${index}`}
              onClick={copySql}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre data-testid={`sql-code-block-${index}`} className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-100">
            {msg.sql}
          </pre>
        </motion.div>
      )}

      {/* raw rows */}
      {showTable && msg.rows?.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="overflow-x-auto rounded-lg border border-slate-200"
        >
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {msg.columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {msg.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/60">
                  {msg.columns.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2 font-mono">
                      {String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </motion.div>
  );
};

export default CopilotMessage;