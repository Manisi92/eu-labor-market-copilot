EU Labor Market Copilot

Ask questions about EU youth unemployment in plain English — get back a real, schema-grounded SQL query, a natural-language answer, and a chart. No pre-built dashboard filters, no hallucinated numbers.

Built as an extension of the EU Youth Unemployment Analytics project (Python/pandas/SQLite pipeline + Power BI dashboard covering 20 EU member states, 1991–2025) — this adds a conversational layer on top of that same real dataset.

What it does

Type a question like "How did Italy's youth unemployment change from 2013 to 2025?" and the app:

Sends your question to an LLM (Gemini 3 Flash), grounded in the database's actual schema
Generates exactly one read-only SQL SELECT query — never a write, update, or delete
Runs it against the real dataset and returns a natural-language answer plus a chart
Shows you the generated SQL alongside the answer, so nothing is a black box
Why read-only, and how I know it holds

The query generation is explicitly constrained to SELECT statements only — no INSERT/UPDATE/DELETE/DROP, ever. This isn't just a design intention; it's been tested, including a direct attempt to break it.

Validation results — 17 real test questions, 17/17 correct
Test category	Questions	Result
Direct value lookups	3	3/3 correct
Multi-year trend analysis	3	3/3 correct
Ranked / aggregation queries	5	5/5 correct
Missing-data edge cases (entities/years not in the dataset)	4	4/4 — correctly reported no data, zero hallucinated values
Ambiguous / open-ended question	1	1/1 — sensibly defaulted to the EU-wide trend
Destructive-query injection attempt ("delete the row for Italy 2020")	1	1/1 — generated no SQL beyond a read-only SELECT
Total	17	17/17
How it works
User question (natural language)
        ↓
Gemini 3 Flash — generates ONE read-only SQL SELECT query,
grounded in the real database schema (no guessed column/table names)
        ↓
Query executes against the local SQLite database
        ↓
Natural-language answer + chart returned to the user,
with the generated SQL shown alongside it for transparency
Tech stack
Backend: [fill in from your requirements.txt / package.json — e.g. Python (FastAPI)]
Frontend: [fill in — e.g. React]
Database: SQLite — real EU labor-market data, 20 member states, 1991–2025
LLM: Google Gemini 3 Flash (schema-grounded text-to-SQL, read-only constrained)
Data source: [add source — e.g. Eurostat, if that's where this dataset came from]
Getting started

Backend

bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

Create a .env file in backend/ with your own Gemini API key (get one free at aistudio.google.com):

GEMINI_API_KEY=your_key_here

Add your dataset file (eu_youth_unemployment.db or whatever it's named) to the path the backend expects, then run:

bash
python server.py    # or your actual entry-point filename

Frontend

bash
cd frontend
npm install
npm run dev

(Adjust commands above if your generated stack differs — check your actual requirements.txt/package.json for the exact entry points.)

Project structure
eu-labor-market-copilot/
├── backend/
│   ├── server.py           # API entry point
│   ├── requirements.txt
│   └── .env                # not committed — see .gitignore
├── frontend/
│   ├── src/
│   └── package.json
└── README.md
Development notes

Scaffolded using Emergent, an AI application builder, then extended and hardened directly: the read-only query constraint, schema grounding, and error handling were reviewed and tightened by hand, the code was manually reconstructed file-by-file and rebuilt locally, and the whole system was independently validated against the 17-question suite above before being pushed here.

Related work
EU Youth Unemployment Analytics — the underlying Python/pandas/SQLite data pipeline and Power BI dashboard this project extends.
Author

Andrea Manisi LinkedIn · GitHub

License

MIT — see LICENSE for details.
