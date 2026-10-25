import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import { computeScore } from "./scoring.js";
import { authRouter, requireAuth } from "./auth.js";
import { buildQueue } from "./queue.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing in .env, refusing to start.");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- Database ---------- */

const leadSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    name: String,
    location: String,
    requirement: String,
    budget: String,
    timeline: String,
    message: String,
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },
    score: { type: Number, default: 0 },
    tag: { type: String, default: "Unscored" },
    chat: [
      {
        role: String,
        text: String,
        at: { type: Date, default: Date.now },
      },
    ],
    debriefs: [
      {
        notes: String,
        changeSummary: String,
        followUpMessage: String,
        scoreBefore: Number,
        scoreAfter: Number,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const Lead = mongoose.model("Lead", leadSchema);

/* ---------- AI helpers ---------- */

// Calls Gemini. If Google is busy (503) or rate-limits us (429),
// wait and retry up to 3 times, then try the fallback model.
async function generate(prompt, { json = false } = {}) {
  const models = [MODEL, process.env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  let lastErr;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: json ? { responseMimeType: "application/json" } : undefined,
        });
        return response.text;
      } catch (err) {
        lastErr = err;
        const retryable = err.status === 503 || err.status === 429;
        if (!retryable) throw err;
        console.log(`Model ${model} busy (attempt ${attempt}/3), retrying...`);
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

// One short line explaining the score, built from the rubric.
function reasonFromBreakdown(breakdown) {
  return breakdown
    .map((b) => {
      const sign = b.points >= 0 ? "+" : "";
      return `${b.label} ${b.value} (${sign}${b.points})`;
    })
    .join(", ");
}

// The AI only extracts facts (signals). The score, the tag and the
// breakdown are computed by our own code in scoring.js.
function normalizeAnalysis(raw) {
  const result = computeScore(raw.signals);
  return {
    summary: raw.summary || "",
    intent: raw.intent || "",
    keyRequirements: Array.isArray(raw.keyRequirements) ? raw.keyRequirements : [],
    objections: Array.isArray(raw.objections) ? raw.objections : [],
    nextAction: raw.nextAction || "",
    suggestedResponse: raw.suggestedResponse || "",
    signals: result.signals,
    breakdown: result.breakdown,
    scoreReason: reasonFromBreakdown(result.breakdown),
    score: result.score,
    tag: result.tag,
  };
}

function leadDetails(lead) {
  return `Name: ${lead.name}
Location: ${lead.location}
Property requirement: ${lead.requirement}
Budget: ${lead.budget}
Buying timeline: ${lead.timeline}
Customer message: ${lead.message}`;
}

const ANALYSIS_KEYS = `summary (string), intent (string), keyRequirements (array of strings),
objections (array of strings), nextAction (string), suggestedResponse (string),
signals (object, described below)`;

const SIGNALS_SPEC = `The "signals" object must have exactly these keys. Do NOT give a score.
- timeline: "immediate" (within 1 month), "short" (1-3 months), "medium" (3-6 months), "long" (more than 6 months), or "unknown"
- budget: "specific" (a clear number or range), "vague" (mentioned but unclear), or "none"
- requirement: "specific" (type, location and key needs are clear), "partial", or "vague"
- engagement: "ready_to_act" (asks for a visit, price, availability or a next step), "interested" (positive but asks for no action), or "browsing" (just exploring)
- objections: "none", "minor" (a question or small worry, such as price negotiation), or "major" (a deal-breaker, such as a budget far below the price)
- needsApproval: true if someone else (spouse, family, partner, boss) must approve, otherwise false
- isSpam: true only if the message is spam, a test, or not about buying property, otherwise false`;

async function analyzeLead(lead) {
  const prompt = `You are an assistant for a real-estate salesperson in India.
Read this lead and reply with JSON only, using exactly these keys:
${ANALYSIS_KEYS}

${SIGNALS_SPEC}

Lead:
${leadDetails(lead)}`;

  const text = await generate(prompt, { json: true });
  return normalizeAnalysis(JSON.parse(text));
}

function sendError(res, err) {
  console.error(err);
  const busy = err.status === 503 || err.status === 429;
  res.status(busy ? 503 : 500).json({
    error: busy
      ? "AI is busy right now, please try again in a moment"
      : "Something went wrong",
  });
}

// A user can only ever load their own leads.
async function findLead(id, userId) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Lead.findOne({ _id: id, owner: userId });
}

/* ---------- Routes ---------- */

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

// Today's action queue: which leads need attention first.
app.get("/api/queue", requireAuth, async (req, res) => {
  try {
    const leads = await Lead.find({ owner: req.userId }).lean();
    res.json(buildQueue(leads));
  } catch (err) {
    sendError(res, err);
  }
});

// Create a lead, analyze it with AI, save it.
// If the AI is unavailable the lead is still saved, and can be re-analyzed later.
app.post("/api/leads", requireAuth, async (req, res) => {
  try {
    const { name, location, requirement, budget, timeline, message } = req.body;
    if (!name || !message) {
      return res.status(400).json({ error: "Name and customer message are required" });
    }

    const lead = new Lead({
      owner: req.userId,
      name,
      location,
      requirement,
      budget,
      timeline,
      message,
    });

    try {
      const analysis = await analyzeLead(lead);
      lead.analysis = analysis;
      lead.score = analysis.score;
      lead.tag = analysis.tag;
    } catch (err) {
      console.error("Analysis failed, saving lead without it:", err.message);
    }

    await lead.save();
    res.status(201).json(lead);
  } catch (err) {
    sendError(res, err);
  }
});

// List the logged-in user's leads, highest score first.
app.get("/api/leads", requireAuth, async (req, res) => {
  try {
    const leads = await Lead.find({ owner: req.userId }).sort({ score: -1, createdAt: -1 });
    res.json(leads);
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/leads/:id", requireAuth, async (req, res) => {
  try {
    const lead = await findLead(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (err) {
    sendError(res, err);
  }
});

app.delete("/api/leads/:id", requireAuth, async (req, res) => {
  try {
    const lead = await findLead(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    await lead.deleteOne();
    res.json({ deleted: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Run the AI analysis again (for leads saved while the AI was busy,
// or saved before the rule-based scoring existed).
app.post("/api/leads/:id/reanalyze", requireAuth, async (req, res) => {
  try {
    const lead = await findLead(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const analysis = await analyzeLead(lead);
    lead.analysis = analysis;
    lead.score = analysis.score;
    lead.tag = analysis.tag;
    await lead.save();
    res.json(lead);
  } catch (err) {
    sendError(res, err);
  }
});

// Conversational interface: answers are grounded in this lead's data.
app.post("/api/leads/:id/chat", requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const lead = await findLead(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const history = lead.chat
      .slice(-10)
      .map((m) => `${m.role === "user" ? "Salesperson" : "Assistant"}: ${m.text}`)
      .join("\n");

    const debriefHistory = lead.debriefs
      .map((d, i) => `Call ${i + 1} notes: ${d.notes}`)
      .join("\n");

    const prompt = `You are a sales coach helping a real-estate salesperson in India
with ONE specific lead. Answer only using the lead information below.
Be concrete and short. If the salesperson asks you to rewrite a message,
give the rewritten message itself. If the lead information does not contain
what is needed, say what is missing instead of guessing.

LEAD DETAILS:
${leadDetails(lead)}

AI ANALYSIS:
${JSON.stringify(lead.analysis)}

CALL NOTES SO FAR:
${debriefHistory || "None yet"}

CONVERSATION SO FAR:
${history || "None yet"}

Salesperson: ${message}
Assistant:`;

    const reply = (await generate(prompt)).trim();

    lead.chat.push({ role: "user", text: message });
    lead.chat.push({ role: "assistant", text: reply });
    await lead.save();

    res.json({ reply });
  } catch (err) {
    sendError(res, err);
  }
});

// Own feature: Post-Call Debrief.
// The salesperson pastes call notes. The AI re-reads the lead with the new
// facts, our rubric re-scores it, and the AI drafts a follow-up message.
app.post("/api/leads/:id/debrief", requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: "Call notes are required" });
    }

    const lead = await findLead(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // The same notes pasted twice must not count as a second call.
    const cleaned = notes.trim().toLowerCase();
    const alreadyAdded = lead.debriefs.some(
      (d) => (d.notes || "").trim().toLowerCase() === cleaned
    );
    if (alreadyAdded) {
      return res.status(400).json({ error: "These call notes were already added to this lead" });
    }

    const previousNotes = lead.debriefs
      .map((d, i) => `Call ${i + 1} notes: ${d.notes}`)
      .join("\n");

    const prompt = `You are an assistant for a real-estate salesperson in India.
The salesperson just spoke to this lead. Update your reading of the lead using
the new call notes. The newest call notes override older information.
Reply with JSON only, using exactly these keys:
${ANALYSIS_KEYS},
changeSummary (string, one or two sentences on what changed in the facts about the lead. Do not mention any numeric score),
followUpMessage (string, a short message to send to the customer after the call)

${SIGNALS_SPEC}

LEAD DETAILS:
${leadDetails(lead)}

EARLIER CALL NOTES:
${previousNotes || "None"}

PREVIOUS ANALYSIS:
${JSON.stringify(lead.analysis)}

NEW CALL NOTES:
${notes}`;

    const text = await generate(prompt, { json: true });
    const raw = JSON.parse(text);
    const analysis = normalizeAnalysis(raw);

    const scoreBefore = lead.score;
    lead.debriefs.push({
      notes,
      changeSummary: raw.changeSummary || "",
      followUpMessage: raw.followUpMessage || "",
      scoreBefore,
      scoreAfter: analysis.score,
    });
    lead.analysis = analysis;
    lead.score = analysis.score;
    lead.tag = analysis.tag;
    await lead.save();

    res.json(lead);
  } catch (err) {
    sendError(res, err);
  }
});

/* ---------- Start ---------- */

const PORT = process.env.PORT || 5000;

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");
} catch (err) {
  console.error("MongoDB connection failed:", err.message);
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));