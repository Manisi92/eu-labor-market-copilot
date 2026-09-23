import os
import re
import json
import sqlite3
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB (chat history persistence)
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

SQLITE_DB_PATH = os.environ["SQLITE_DB_PATH"]
GEMINI_LLM_KEY = os.environ["AQ.Ab8RN6ITZjxZ6Lm_eFBINGXVetvW6wl7InCq2oROnjfSqb7eNA"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

SCHEMA_DDL = """CREATE TABLE "youth_unemployment" (
  "entity" TEXT,                  -- full name, e.g. 'Spain', 'European Union - 27 countries'
  "country_code" TEXT,            -- ISO-ish code, e.g. 'ES', 'DE', or aggregate code 'EU27_2020', 'EA20'
  "year" INTEGER,                 -- calendar year
  "youth_unemployment_rate" REAL, -- % of labour force under 25 unemployed
  "is_eu_aggregate" INTEGER       -- 1 for EU/Euro-area aggregates, 0 for individual countries

);"""

FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|VACUUM|GRANT|REVOKE|MERGE)\b",
    re.IGNORECASE,
)

SYSTEM_PROMPT = f"""You are a text-to-SQL engine for a single SQLite table about EU youth unemployment.

Schema (this is the ONLY table and the ONLY columns that exist):
{SCHEMA_DDL}

Rules:
- Generate EXACTLY ONE read-only SQL SELECT statement (a leading CTE `WITH ... SELECT` is allowed).
- NEVER generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, PRAGMA or any write/DDL statement.
- Only use the table `youth_unemployment` and its listed columns.
- - To compare countries, filter `is_eu_aggregate = 0`. To reference "the EU" / "EU average" use country_code 'EU27_2020'. For the Euro area use 'EA20'.
- Always include a sensible ORDER BY and a LIMIT when the user asks for "top", "highest", "lowest" etc.
- Return rounded, human-friendly columns and give year an integer.

You must respond with ONLY a compact JSON object (no markdown, no code fences) of the form:
{{
  "sql": "<the single SELECT statement>",
  "chart_type": "bar" | "line",
  "x_field": "<column name from the SELECT used for the x-axis / category>",
  "y_field": "<numeric column name from the SELECT to plot>",
  "series_field": "<optional column whose distinct values become separate lines/bars, or null>",
  "answer": "<one short sentence framing what the result shows, no numbers invented>"

}}

Chart guidance: use "line" for trends over multiple years (x = year), use "bar" for comparisons across countries/categories at a point in time. If comparing multiple entities across years, set chart_type "line", x_field "year", series_field to the entity/country column. For a SINGLE country's trend over years, ALSO select the `entity` column and set series_field to "entity" so the line is labeled by the country name.
"""


class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    id: str
    session_id: str
    question: str
    sql: str
    answer: str
    chart: Dict[str, Any]
    columns: List[str]
    rows: List[Dict[str, Any]]


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t.strip())
    return t.strip()


def validate_sql(sql: str) -> str:
    s = sql.strip().rstrip(";").strip()
    if ";" in s:
        raise HTTPException(400, "Only a single SQL statement is allowed.")
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise HTTPException(400, "Only read-only SELECT queries are permitted.")
    if FORBIDDEN.search(s):
        raise HTTPException(400, "The generated query contained a forbidden (write) keyword and was blocked.")
    return s


def run_query(sql: str):
    # Open the SQLite file strictly read-only via URI so no write can ever occur.
    uri = f"file:{SQLITE_DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(sql)
        rows = [dict(r) for r in cur.fetchall()]
        columns = [d[0] for d in cur.description] if cur.description else []
        return columns, rows
    finally:
        conn.close()


def ro_query(sql: str, params=()):
    uri = f"file:{SQLITE_DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

def build_reference() -> str:
    """List the exact entities/codes in the mounted DB so the LLM never guesses codes."""
    rows = ro_query(
        "SELECT DISTINCT entity, country_code, is_eu_aggregate FROM youth_unemployment ORDER BY is_eu_aggregate DESC, entity"
    )
    lines = [f"{r['entity']} | {r['country_code']} | {r['is_eu_aggregate']}" for r in rows]
    return (
        "Reference — entities available in THIS database (entity | country_code | is_eu_aggregate). "
        "Use these exact values only:\n" + "\n".join(lines)
    )

def build_chart(rows, chart_type, x_field, y_field, series_field):
    chart = {"type": chart_type or "bar", "x_key": x_field, "series": [], "data": []}
    if not rows:
        return chart
    cols = list(rows[0].keys())
    if x_field not in cols:
        x_field = cols[0]
    if y_field not in cols:
        numeric = [c for c in cols if c != x_field and isinstance(rows[0][c], (int, float))]
        y_field = numeric[0] if numeric else cols[-1]
    chart["x_key"] = x_field

    if series_field and series_field in cols and series_field != x_field:
        series_vals = []
        pivot = {}
        for r in rows:
            xv = r[x_field]
            sv = str(r[series_field])
            if sv not in series_vals:
                series_vals.append(sv)
            pivot.setdefault(xv, {x_field: xv})
            pivot[xv][sv] = r[y_field]
        chart["series"] = series_vals
        chart["data"] = list(pivot.values())
    else:
        chart["series"] = [y_field]
        chart["data"] = [{x_field: r[x_field], y_field: r[y_field]} for r in rows]
    chart["y_field"] = y_field
    return chart


def summarize(answer_intent, rows, chart):
    if not rows:
        return "The query ran successfully but returned no matching rows for that question."
    y = chart.get("y_field")
    x = chart.get("x_key")
    parts = [answer_intent.strip()] if answer_intent else []
    n = len(rows)
    numeric_vals = [r.get(y) for r in rows if isinstance(r.get(y), (int, float))]
    series = chart.get("series", [])
    if len(rows) == 1 and numeric_vals:
        parts.append(f"The value is {round(numeric_vals[0], 1)}%.")
    elif chart.get("type") == "line" and len(series) == 1 and len(numeric_vals) >= 2:
        first, last = numeric_vals[0], numeric_vals[-1]
        change = round(last - first, 1)
        direction = "rose" if change > 0 else "fell" if change < 0 else "was flat"
        parts.append(
            f"Over this period it {direction} from {round(first, 1)}% to {round(last, 1)}% "
            f"({'+' if change > 0 else ''}{change} pp), ranging {round(min(numeric_vals), 1)}%–{round(max(numeric_vals), 1)}%."
        )
    elif numeric_vals and (not series or series == [y]):
        top = max(rows, key=lambda r: r.get(y) if isinstance(r.get(y), (int, float)) else float("-inf"))
        low = min(rows, key=lambda r: r.get(y) if isinstance(r.get(y), (int, float)) else float("inf"))
        parts.append(
            f"Across {n} result{'s' if n != 1 else ''}, the highest is {top.get(x)} at {round(top.get(y), 1)}% "
            f"and the lowest is {low.get(x)} at {round(low.get(y), 1)}%."
        )
    else:
        parts.append(f"The result set contains {n} rows across {len(series)} series.")
    return " ".join(p for p in parts if p)


@api_router.get("/")
async def root():
    return {"message": "EU Labor Market Copilot API"}


@api_router.get("/schema")
async def get_schema():
    return {
        "table": "youth_unemployment",
        "ddl": SCHEMA_DDL,
        "columns": [
            {"name": "entity", "type": "TEXT", "desc": "Full name of the country or aggregate."},
            {"name": "country_code", "type": "TEXT", "desc": "The dataset's code for the entity (e.g. ISO3 like DEU, FRA, or an aggregate code such as OWID_EU27)."},
            {"name": "year", "type": "INTEGER", "desc": "Calendar year."},
            {"name": "youth_unemployment_rate", "type": "REAL", "desc": "% of under-25 labour force unemployed."},
            {"name": "is_eu_aggregate", "type": "INTEGER", "desc": "1 = EU/Euro-area aggregate, 0 = single country."},
        ],
    }


@api_router.get("/entities")
async def entities():
    rows = ro_query(
        "SELECT DISTINCT entity, country_code, is_eu_aggregate FROM youth_unemployment ORDER BY is_eu_aggregate DESC, entity"
    )
    yr = ro_query("SELECT MIN(year) AS mn, MAX(year) AS mx FROM youth_unemployment")[0]
    years = [r["year"] for r in ro_query("SELECT DISTINCT year FROM youth_unemployment ORDER BY year")]
    eu = next((r for r in rows if r.get("is_eu_aggregate") == 1), None)
    return {"entities": rows, "year_min": yr["mn"], "year_max": yr["mx"], "years": years, "eu_aggregate": eu}

@api_router.get("/ranking")
async def ranking(year: int):
    rows = ro_query(
        "SELECT entity, country_code, youth_unemployment_rate FROM youth_unemployment "
        "WHERE is_eu_aggregate = 0 AND year = ? AND youth_unemployment_rate IS NOT NULL "
        "ORDER BY youth_unemployment_rate DESC",
        (year,),
    )
    eu = ro_query(
        "SELECT youth_unemployment_rate FROM youth_unemployment WHERE is_eu_aggregate = 1 AND year = ? LIMIT 1",
        (year,),
    )
    return {"year": year, "rows": rows, "eu_rate": eu[0]["youth_unemployment_rate"] if eu else None}

@api_router.get("/series")
async def series(codes: str, start: Optional[int] = None, end: Optional[int] = None):
    code_list = [c.strip() for c in codes.split(",") if re.fullmatch(r"[A-Za-z0-9_]+", c.strip())]
    if not code_list:
        raise HTTPException(400, "No valid country codes provided.")
    placeholders = ",".join("?" for _ in code_list)
    sql = (
        "SELECT entity, country_code, year, youth_unemployment_rate "
        f"FROM youth_unemployment WHERE country_code IN ({placeholders})"
    )
    params: list = list(code_list)
    if start is not None:
        sql += " AND year >= ?"
        params.append(start)
    if end is not None:
        sql += " AND year <= ?"
        params.append(end)
    sql += " ORDER BY year"
    return {"rows": ro_query(sql, params)}


@api_router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty.")
    session_id = req.session_id or str(uuid.uuid4())

    # --- ONE LLM call: text-to-SQL ---
    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"sql-{uuid.uuid4()}",
        system_message=SYSTEM_PROMPT + "\n\n" + build_reference(),
    ).with_model("gemini", "gemini-3-flash-preview")

    try:
        raw = await chat_client.send_message(UserMessage(text=question))
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(502, f"The language model could not generate a query: {e}")

    payload = _strip_fences(raw if isinstance(raw, str) else str(raw))
    try:
        spec = json.loads(payload)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", payload, re.DOTALL)
        if not m:
            raise HTTPException(502, "The model did not return a valid query specification.")
        spec = json.loads(m.group(0))

    sql = validate_sql(spec.get("sql", ""))

    # --- ONE execution step ---
    try:
        columns, rows = run_query(sql)
    except sqlite3.Error as e:
        raise HTTPException(400, f"The generated SQL failed to execute: {e}")

    chart = build_chart(
        rows,
        spec.get("chart_type"),
        spec.get("x_field"),
        spec.get("y_field"),
        spec.get("series_field"),
    )
    answer = summarize(spec.get("answer", ""), rows, chart)

    result = ChatResponse(
        id=str(uuid.uuid4()),
        session_id=session_id,
        question=question,
        sql=sql,
        answer=answer,
        chart=chart,
        columns=columns,
        rows=rows,
    )

    # persist chat history
    doc = result.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_one(doc)

    return result

@api_router.get("/message/{message_id}", response_model=ChatResponse)
async def get_message(message_id: str):
    doc = await db.chat_messages.find_one({"id": message_id}, {"_id": 0, "created_at": 0})
    if not doc:
        raise HTTPException(404, "Snapshot not found.")
    return doc

@api_router.get("/history/{session_id}", response_model=List[ChatResponse])
async def history(session_id: str):
    docs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0, "created_at": 0}).to_list(500)
    return docs


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


