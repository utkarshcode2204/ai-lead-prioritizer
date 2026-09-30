# AI Lead Prioritizer

An AI-powered web app that helps a real-estate salesperson see which inbound leads matter, what each customer wants, and what to do next.

- **Live app:** https://ai-lead-prioritizer.vercel.app
- **Note:** the backend runs on a free plan, so the first load after a break can take up to a minute.

## What I built

- **Lead intake:** form for name, location, property requirement, budget, buying timeline and the customer message.
- **AI analysis:** summary, customer intent, key requirements, objections, recommended next action, suggested reply, plus a 0-100 score with a one-line reason.
- **Lead list and prioritization:** all leads are saved, sorted by score, with Hot / Warm / Cold filters.
- **Conversational interface:** ask follow-up questions about one lead ("make my reply more assertive"). Answers use only that lead's data.
- **My own feature, Post-Call Debrief:** after a call, the salesperson pastes their notes. The AI re-scores the lead, explains why the score moved, updates the analysis and drafts a follow-up message. Every call is kept in a history.

## Architecture

- **Frontend:** React (Vite), deployed on Vercel.
- **Backend:** Node.js + Express, deployed on Render (free plan).
- **Database:** MongoDB Atlas (free tier) stores leads, chat history and debriefs.
- **AI:** Google Gemini API, called only from the backend so the API key is never exposed.

The browser calls the Express API. The API loads the lead from MongoDB, builds a prompt from the lead's data, calls Gemini, validates the reply and saves the result.

## AI model and how it is called

- Model: `gemini-3.5-flash-lite` (main) with `gemini-3.1-flash-lite` as fallback, through the `@google/genai` SDK.
- Analysis and debrief calls use JSON output mode, then the server validates and normalizes the result.
- Chat calls send the lead's details, its latest analysis, earlier call notes and the last 10 messages, so answers stay grounded in that lead.

## Run locally

1. Backend: go to `backend`, create a `.env` file with `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `MONGODB_URI` and `PORT=5000`, then run `npm install` and `node server.js`.
2. Frontend: go to `frontend`, run `npm install` and `npm run dev`, then open http://localhost:5173. The dev server proxies `/api` to port 5000.

## Key technical decisions

- **The tag is computed in code from the score** (70+ Hot, 40-69 Warm, below 40 Cold), so the score and the tag can never disagree.
- **Retries and a fallback model.** The free Gemini tier often returns 503 "busy". The server retries with backoff and then tries the fallback model.
- **Leads are saved even if the AI fails.** The user can re-run the analysis later.
- **Post-Call Debrief** covers the "after the call" part of a salesperson's day, where leads usually go stale.
- **Structured JSON output** with server-side validation keeps the UI simple and predictable.

## Known limitations

- The score is judged by the AI and is not calibrated against real conversion data.
- Pasting the same call notes twice counts as a new call and moves the score again.
- No login: all users share the same lead list.
- Free hosting means slow first loads, and the free Gemini tier can be busy.
- Chat only remembers the last 10 messages.