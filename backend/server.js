import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- Database ---------- */

const leadSchema = new mongoose.Schema(
  {
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

// The tag is derived from the score in our own code,
// so the two can never disagree.
function tagFromScore(score) {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}

function normalizeAnalysis(raw) {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)));
  return {
    summary: raw.summary || "",
    intent: raw.intent || "",
    keyRequirements: Array.isArray(raw.keyRequirements) ? raw.keyRequirements : [],
    objections: Array.isArray(raw.objections) ? raw.objections : [],
    nextAction: raw.nextAction || "",
    suggestedResponse: raw.suggestedResponse || "",
    scoreReason: raw.scoreReason || "",
    score,
    tag: tagFromScore(score),
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
score (number 0-100), scoreReason (string, one short sentence)`;

const SCORE_RULES = `Scoring guide: 70-100 = Hot (clear need, budget, and a short timeline),
40-69 = Warm (interested but vague, long timeline, or budget mismatch),
0-39 = Cold (browsing, no budget, no timeline, or spam).`;

async function analyzeLead(lead) {
  const prompt = `You are an assistant for a real-estate salesperson in India.
Analyze this lead and reply with JSON only, using exactly these keys:
${ANALYSIS_KEYS}

${SCORE_RULES}

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

async function findLead(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Lead.findById(id);
}

/* ---------- Routes ---------- */

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Create a lead, analyze it with AI, save it.
// If the AI is unavailable the lead is still saved, and can be re-analyzed later.
app.post("/api/leads", async (req, res) => {
  try {
    const { name, location, requirement, budget, timeline, message } = req.body;
    if (!name || !message) {
      return res.status(400).json({ error: "Name and customer message are required" });
    }

    const lead = new Lead({ name, location, requirement, budget, timeline, message });

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

// List all leads, highest score first.
app.get("/api/leads", async (req, res) => {
  try {
    const leads = await Lead.find().sort({ score: -1, createdAt: -1 });
    res.json(leads);
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/leads/:id", async (req, res) => {
  try {
    const lead = await findLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (err) {
    sendError(res, err);
  }
});

app.delete("/api/leads/:id", async (req, res) => {
  try {
    const lead = await findLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    await lead.deleteOne();
    res.json({ deleted: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Run the AI analysis again (for leads saved while the AI was busy).
app.post("/api/leads/:id/reanalyze", async (req, res) => {
  try {
    const lead = await findLead(req.params.id);
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
app.post("/api/leads/:id/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const lead = await findLead(req.params.id);
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
// The salesperson pastes call notes. The AI re-scores the lead,
// explains what changed, and drafts a follow-up message.
app.post("/api/leads/:id/debrief", async (req, res) => {
  try {
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: "Call notes are required" });

    const lead = await findLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const prompt = `You are an assistant for a real-estate salesperson in India.
The salesperson just spoke to this lead. Use the call notes to update the analysis.
Reply with JSON only, using exactly these keys:
${ANALYSIS_KEYS},
changeSummary (string, one or two sentences on what changed and why the score moved),
followUpMessage (string, a short message to send to the customer after the call)

${SCORE_RULES}

LEAD DETAILS:
${leadDetails(lead)}

PREVIOUS ANALYSIS:
${JSON.stringify(lead.analysis)}

CALL NOTES:
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