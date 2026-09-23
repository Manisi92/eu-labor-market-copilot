import { useState, useRef, useEffect, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, ArrowUp, Loader2, Info, Trash2, Database, Star, Users, ListOrdered, ArrowUpDown} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import CopilotMessage from "@/components/CopilotMessage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SAMPLE_QUERIES = [
  "Which 5 EU countries had the highest youth unemployment rate in 2022?",
  "Compare youth unemployment between Italy, Germany and the EU aggregate from 2015 to 2023.",
  "What was the trend of youth unemployment in France over the last 10 years?",
  "Show me countries where youth unemployment exceeded 20% in 2020.",
];

const SCHEMA_FIELDS = [
  ["entity", "TEXT", "Full name of the country or aggregate (e.g. 'Spain')."],
  ["country_code", "TEXT", "The dataset's code for each entity (e.g. ISO3 DEU, FRA — or an aggregate like OWID_EU27)."],
["year", "INTEGER", "Calendar year of the observation."],
  ["youth_unemployment_rate", "REAL", "% of the under-25 labour force unemployed."],
  ["is_eu_aggregate", "INTEGER", "1 = EU / Euro-area aggregate, 0 = single country."],
];

function SchemaDialog({ entities = [] }) {}
  const codeSample = entities
    .filter((e) => e.is_eu_aggregate === 0)
    .slice(0, 8)
    .map((e) => e.country_code)
    .join(", ");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          data-testid="schema-info-btn"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-[#1E40AF]"
        >
          <Info className="h-3.5 w-3.5" />
          Schema
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-slate-900">
            <Database className="h-4 w-4 text-[#1E40AF]" /> youth_unemployment
          </DialogTitle>
          <DialogDescription>
            The single read-only table the copilot queries. Every answer is grounded in these columns.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {SCHEMA_FIELDS.map(([name, type, desc]) => (
            <div key={name} className="flex flex-col gap-0.5 px-4 py-3">
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm font-medium text-[#1E40AF]">{name}</code>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                  {type}
                </span>
              </div>
              <span className="text-xs text-slate-500">{desc}</span>
            </div>
          ))}
        </div>
        {codeSample && (
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Codes in this dataset: {codeSample}…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RankingDialog({ meta }) {
  const years = meta?.years || [];
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState({ key: "rate", dir: "desc" });

  const activeYear = year ?? (years.length ? years[years.length - 1] : null);

  useEffect(() => {
    if (!open || activeYear == null) return;
    setLoading(true);
    axios
      .get(`${API}/ranking`, { params: { year: activeYear } })
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, activeYear]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const sorted = [...data.rows];
    sorted.sort((a, b) => {
      if (sort.key === "name") return a.entity.localeCompare(b.entity);
      return b.youth_unemployment_rate - a.youth_unemployment_rate;
    });
    if ((sort.key === "rate" && sort.dir === "asc") || (sort.key === "name" && sort.dir === "desc")) sorted.reverse();
    return sorted;
  }, [data, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid="rankings-btn"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-[#1E40AF]"
        >
          <ListOrdered className="h-3.5 w-3.5" />
          Rankings
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-slate-900">
            <ListOrdered className="h-4 w-4 text-[#1E40AF]" /> Country rankings
          </DialogTitle>
          <DialogDescription>Full ranking of countries by youth unemployment for any year.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Year</label>
          <select
            data-testid="ranking-year-select"
            value={activeYear ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-[#1E40AF] focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {data?.eu_rate != null && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#DBEAFE] px-2.5 py-1 text-xs font-medium text-[#1E40AF]">
              EU average {data.eu_rate.toFixed(1)}%
            </span>
          )}
        </div>

        <div className="mt-1 max-h-[22rem] overflow-y-auto rounded-lg border border-slate-200">
          <table data-testid="ranking-table" className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2">
                  <button data-testid="ranking-sort-name" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 font-semibold hover:text-[#1E40AF]">
                    Country <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button data-testid="ranking-sort-rate" onClick={() => toggleSort("rate")} className="inline-flex items-center gap-1 font-semibold hover:text-[#1E40AF]">
                    Rate <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const aboveEu = data?.eu_rate != null && r.youth_unemployment_rate > data.eu_rate;
                  return (
                    <tr key={r.country_code} data-testid={`ranking-row-${r.country_code}`} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-mono text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.entity}</td>
                      <td className={`px-3 py-2 text-right font-mono ${aboveEu ? "text-rose-600" : "text-emerald-700"}`}>
                        {r.youth_unemployment_rate.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareDialog({ entities, euAggregate, onCompare }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const countries = entities.filter((e) => e.is_eu_aggregate === 0);

  const toggle = (name) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : s.length >= 6 ? s : [...s, name]));

  const run = () => {
    const names = [...selected];
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.slice(-1)}` : names[0];
    const q = `Compare youth unemployment between ${list} across all available years.`;
    setOpen(false);
    setSelected([]);
    onCompare(q);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid="compare-countries-btn"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-[#1E40AF]"
        >
          <Users className="h-3.5 w-3.5" />
          Compare
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-slate-900">
            <Users className="h-4 w-4 text-[#1E40AF]" /> Compare countries
          </DialogTitle>
          <DialogDescription>Pick 2–6 countries to chart side-by-side — no typing needed.</DialogDescription>
        </DialogHeader>
        <div className="mt-1 flex max-h-64 flex-wrap gap-2 overflow-y-auto py-2">
          {countries.map((c) => {
            const on = selected.includes(c.entity);
            return (
              <button
                key={c.country_code}
                data-testid={`compare-chip-${c.country_code}`}
                onClick={() => toggle(c.entity)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  on
                    ? "border-[#1E40AF] bg-[#1E40AF] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[#93C5FD] hover:text-[#1E40AF]"
                }`}
              >
                {c.entity}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">{selected.length} selected {selected.length >= 6 && "(max)"}</span>
          <button
            data-testid="compare-run-btn"
            disabled={selected.length < 2}
            onClick={run}
            className="rounded-xl bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Chart {selected.length > 1 ? `${selected.length} countries` : "comparison"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [meta, setMeta] = useState(null);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    axios
      .get(`${API}/entities`)
      .then(({ data }) => setMeta(data))
      .catch(() => {});
  }, []);

  // Load a shared snapshot from ?m=<messageId>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("m");
    if (!id) return;
    axios
      .get(`${API}/message/${id}`)
      .then(({ data }) => {
        setMessages([{ role: "user", question: data.question, id: `${data.id}-q` }, { role: "copilot", ...data }]);
      })
      .catch(() => toast.error("That shared snapshot could not be found."));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";

    const userMsg = { role: "user", question, id: crypto.randomUUID() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const { data } = await axios.post(`${API}/chat`, { question, session_id: sessionId });
      setMessages((m) => [...m, { role: "copilot", ...data }]);
    } catch (e) {
      const detail = e?.response?.data?.detail || "Something went wrong generating your answer.";
      toast.error(detail);
      setMessages((m) => [...m, { role: "error", id: crypto.randomUUID(), text: detail, question }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const autoGrow = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const hasChat = messages.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      {/* header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div data-testid="app-header-brand" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E40AF] text-white">
              <Star className="h-4 w-4" fill="currentColor" />
            </div>
            <div className="leading-tight">
              <h1 className="font-heading text-sm font-bold tracking-tight text-slate-900">
                EU Labor Market Copilot
              </h1>
              <p className="font-mono text-[10px] text-slate-400">SQLite · youth_unemployment</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <RankingDialog meta={meta} />
            <CompareDialog entities={meta?.entities || []} euAggregate={meta?.eu_aggregate} onCompare={send} />
            <SchemaDialog entities={meta?.entities || []} />
            {hasChat && (
              <button
                data-testid="header-clear-chat-btn"
                onClick={() => setMessages([])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      </header>

      {/* body */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-6 lg:px-8">
        {!hasChat ? (
          <div
            data-testid="empty-state-container"
            className="flex flex-1 flex-col justify-center py-12"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-2xl"
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#DBEAFE] px-3 py-1 text-xs font-medium text-[#1E40AF]">
                <Sparkles className="h-3.5 w-3.5" /> Natural language → SQL → chart
              </div>
              <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Decision-ready EU labor
                <br />
                market intelligence.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">
                Ask a plain-English question about youth unemployment across EU member states,
                aggregates and historic trends. Every answer shows the exact SQL it ran.
              </p>
            </motion.div>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SAMPLE_QUERIES.map((q, i) => (
                <motion.button
                  key={q}
                  data-testid={`sample-prompt-card-${i}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.07 }}
                  onClick={() => send(q)}
                  className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93C5FD] hover:shadow-md"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-500 transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#1E40AF]">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-snug text-slate-700 group-hover:text-slate-900">
                    {q}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div data-testid="chat-thread-container" className="flex-1 space-y-6 py-8">
            <AnimatePresence initial={false}>
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    data-testid={`user-message-${i}`}
                    className="flex justify-end"
                  >
                    <div className="max-w-2xl rounded-2xl border border-slate-200/60 bg-slate-100 px-5 py-3.5 text-slate-900">
                      {m.question}
                    </div>
                  </motion.div>
                ) : m.role === "error" ? (
                  <div
                    key={m.id}
                    data-testid={`error-message-${i}`}
                    className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
                  >
                    {m.text}
                  </div>
                ) : (
                  <CopilotMessage key={m.id} msg={m} index={i} euAggregate={meta?.eu_aggregate} />
                )
              )}
            </AnimatePresence>

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
              >
                <Loader2 className="h-4 w-4 animate-spin text-[#1E40AF]" />
                Generating SQL and querying the dataset…
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* input */}
      <div className="sticky bottom-0 z-40 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent px-4 pb-6 pt-6 sm:px-6 lg:px-8">
        <form
          data-testid="chat-input-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto flex max-w-5xl items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 pl-4 shadow-sm transition-all focus-within:border-[#1E40AF] focus-within:ring-2 focus-within:ring-blue-100"
        >
          <textarea
            ref={taRef}
            data-testid="chat-input-textarea"
            rows={1}
            value={input}
            onChange={autoGrow}
            onKeyDown={onKeyDown}
            placeholder="Ask about EU youth unemployment…"
            className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            data-testid="chat-submit-btn"
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E40AF] text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-5xl text-center font-mono text-[10px] text-slate-400">
          Read-only SELECT queries only · generated by gemini-3-flash
        </p>
      </div>
    </div>
  );
}


