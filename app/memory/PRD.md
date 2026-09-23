# EU Labor Market Copilot — PRD

## Original Problem Statement
Single-page chat web app. On each user question, an LLM generates exactly one read-only SQL SELECT constrained to the `youth_unemployment` SQLite schema (never write/DDL), runs it, and returns a short natural-language answer plus a bar/line chart, with the generated SQL shown for transparency. One API endpoint, one LLM call for text-to-SQL, one execution step. No multi-agent framework, no extra services.

## Architecture
- **Frontend**: React SPA (`ChatApp.jsx`, `CopilotMessage.jsx`, `ResultChart.jsx`), Recharts, framer-motion, sonner. Clean light "decision-ready reporting" theme, muted EU blue (#1E40AF), Outfit/Inter/JetBrains Mono.
- **Backend**: FastAPI single endpoint `POST /api/chat` → one Gemini 3 Flash call (Emergent Universal Key via emergentintegrations) produces JSON {sql, chart_type, x_field, y_field, series_field, answer} → `validate_sql` (SELECT-only, forbidden-keyword + single-statement guard) → one execution via read-only SQLite URI (`mode=ro`) → `build_chart` + deterministic `summarize`. Chat history persisted in MongoDB. Helper routes: `GET /api/schema`, `GET /api/history/{session_id}`.
- **Database**: User-uploaded `youth_unemployment.db` at `SQLITE_DB_PATH` (735 rows, 21 entities, years 1991–2025). Schema: entity, country_code, year, youth_unemployment_rate, is_eu_aggregate.

## User Personas
- Policy analysts / journalists / economists wanting quick, transparent answers about EU youth unemployment without writing SQL.

## Core Requirements (static)
- Exactly one LLM text-to-SQL call and one read-only execution per question.
- Never allow INSERT/UPDATE/DELETE/DROP/DDL — enforced by prompt + validator + read-only connection.
- Auto-select bar (comparisons) vs line (trends). Always display the generated SQL.

## Implemented (2026-06)
- text-to-SQL via Gemini 3 Flash, SQL safety guard (3 layers), read-only execution.
- Answer + auto bar/line chart, collapsible SQL with copy, raw-rows table, schema dialog, sample prompts, clear chat.
- Chat history persistence in MongoDB.
- **Country Compare** dialog (quick-pick chips → multi-series line), **Trend Insights** callout (biggest rise / sharpest fall), **CSV Export**, **EU vs Member overlay** toggle.
- Prompt now dynamically injects the real entity/country_code list from the mounted DB (`build_reference()`), so it adapts to any uploaded .db; generic pre-query answer avoids hallucinated results.
- Verified: backend pytest 11/11, frontend E2E 100% (iterations 1–3). Works against user's real 735-row DB; injection attempts neutralized.

## Backlog
- P2: migrate deprecated `@app.on_event('shutdown')` to lifespan; pagination for history; silence transient Recharts width(-1) warning.

## Next Tasks
- Await user feedback / feature requests.
