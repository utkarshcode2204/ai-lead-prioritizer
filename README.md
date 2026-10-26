# AI Lead Prioritizer

An AI-powered web app that helps a real-estate salesperson see which inbound leads matter, what each customer wants, and who to call first today.

- **Live app:** https://ai-lead-prioritizer-v2.vercel.app
- **Note:** the backend runs on a free plan, so the first load after a break can take up to a minute.

## What it does

- **Lead intake:** form for name, location, property requirement, budget, buying timeline and the customer message.
- **AI analysis:** summary, customer intent, key requirements, objections, recommended next action and a suggested reply.
- **Rule-based scoring:** a 0-100 score, a Hot / Warm / Cold tag and a point-by-point breakdown that explains the score.
- **Lead list and prioritization:** leads are saved per user, sorted by score, with Hot / Warm / Cold filters.
- **Conversational interface:** ask follow-up questions about one lead ("make my reply more assertive"). Answers use only that lead's data and call history.
- **Post-Call Debrief (my own feature):** after a call, the salesperson pastes their notes. The lead is re-read with the new facts, re-scored, and a follow-up message is drafted. Every call is kept in a history. Pasting the same notes twice is rejected.
- **Today's action queue:** a ranked "who to call first" list. A promising lead that has gone quiet moves up, so nobody is forgotten.
- **Accounts:** register and log in. Each salesperson sees only their own leads.

## Architecture

- **Frontend:** React (Vite), deployed on Vercel.
- **Backend:** Node.js + Express, deployed on Render (free plan).
- **Database:** MongoDB Atlas (free tier) stores users, leads, chat history and call debriefs.
- **AI:** Google Gemini API, called only from the backend so the API key is never exposed to the browser.
- **Auth:** bcrypt-hashed passwords and signed JWT tokens (7 days).
- **Tests and CI:** Vitest unit tests, run on every push by GitHub Actions.

Flow: the browser calls the Express API with a token. The API loads the lead from MongoDB, builds a prompt, calls Gemini, validates the reply, scores it with our own rubric and saves the result.

## How scoring works

The AI does not decide the score. It only reads the lead and extracts facts (signals). The code in `backend/scoring.js` then adds up points from a fixed rubric:

- Timeline: up to 25 points
- Budget: up to 20 points
- Requirement clarity: up to 15 points
- Engagement (asks for a visit or next step): up to 25 points
- Objections: up to 15 points
- Needs another person's approval: minus 5 points
- Spam or irrelevant: score capped at 10

Hot is 75 and above, Warm is 45 to 74, Cold is below 45. The same signals always give the same score, and the breakdown is shown on screen.

## How the queue works

Priority is the lead's score plus 3 points for every day without contact (up to 14 days). Cold leads get no boost. A lead saved without an AI analysis gets a fixed priority and a "re-run analysis" reason. The logic lives in `backend/queue.js` as pure functions.

## AI model and how it is called

- Model: `gemini-3.5-flash-lite` with `gemini-3.1-flash-lite` as the fallback, through the `@google/genai` SDK.
- Analysis and debrief calls use JSON output mode. The server validates the reply, and unknown values fall back to safe defaults.
- Chat calls send the lead's details, its latest analysis, earlier call notes and the last 10 messages, so answers stay grounded in that lead.

## Run locally

1. Backend: go to `backend` and create a `.env` file with `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `MONGODB_URI`, `JWT_SECRET` (any long random string) and `PORT=5000`. Then run `npm install` and `node server.js`.
2. Frontend: go to `frontend`, run `npm install` and `npm run dev`, then open http://localhost:5173. The dev server proxies `/api` to port 5000.
3. Tests: go to `backend` and run `npm test`.

## Key technical decisions

- **The AI extracts facts and the code scores.** An earlier version let the AI give the score directly, and it was inconsistent: a lead with a 3 to 6 month timeline scored Hot. Moving the scoring into code made it deterministic, explainable and testable.
- **The tag is computed from the score**, so the two can never disagree.
- **Retries and a fallback model.** The free Gemini tier often returns 503 "busy". The server retries with backoff and then tries the fallback model.
- **Leads are saved even if the AI fails.** The user can re-run the analysis later.
- **Per-user data.** Every lead stores its owner, every lead route requires a login, and a user asking for someone else's lead gets a 404, so it is not even revealed that the lead exists.
- **Same error for a wrong email and a wrong password** on login, so the form cannot be used to find out which emails exist.
- **Pure functions for scoring and the queue**, so they are covered by fast unit tests (23 tests).

## Known limitations

- The AI's reading of a lead (the signals) can still vary slightly between runs. The scoring weights are hand-tuned and not calibrated against real conversion data.
- "Last contact" is the creation date or the last logged call. Calls are not tracked automatically.
- The login token is kept in browser storage, and there is no password reset or rate limiting yet.
- Free hosting means slow first loads, and the free Gemini tier can be busy.
- Chat only remembers the last 10 messages.