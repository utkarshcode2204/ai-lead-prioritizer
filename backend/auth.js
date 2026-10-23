import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/* ---------- User model ---------- */

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);

/* ---------- Helpers ---------- */

const TOKEN_DAYS = 7;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: `${TOKEN_DAYS}d`,
  });
}

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

// Protects a route: the request must carry a valid token.
// On success, req.userId holds the logged-in user's id.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired, please log in again" });
  }
}

/* ---------- Routes ---------- */

export const authRouter = express.Router();

authRouter.post("/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await User.findOne({ email });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));

    // Same message for a wrong email and a wrong password,
    // so nobody can use the login form to find out which emails exist.
    if (!ok) return res.status(401).json({ error: "Incorrect email or password" });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "Please log in" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});