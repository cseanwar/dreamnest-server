import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { User } from "../types";
import { authMiddleware } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

function generateToken(userId: ObjectId, email: string): string {
  return jwt.sign({ userId: userId.toString(), email }, JWT_SECRET, { expiresIn: "7d" });
}

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const db = await getDB();
    const existing = await db.collection<User>("users").findOne({ email: email.toLowerCase() });

    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await db.collection<User>("users").insertOne({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "user",
      createdAt: new Date(),
    });

    const token = generateToken(result.insertedId, email.toLowerCase());

    res.status(201).json({
      token,
      user: { id: result.insertedId.toString(), name, email: email.toLowerCase(), role: "user" },
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const db = await getDB();
    const user = await db.collection<User>("users").findOne({ email: email.toLowerCase() });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = generateToken(user._id!, user.email);

    res.json({
      token,
      user: { id: user._id!.toString(), name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/demo", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    let user = await db.collection<User>("users").findOne({ email: "demo@dreamnest.com" });

    if (!user) {
      const hashedPassword = await bcrypt.hash("demo123456", 12);
      const result = await db.collection<User>("users").insertOne({
        name: "Demo User",
        email: "demo@dreamnest.com",
        password: hashedPassword,
        role: "user",
        createdAt: new Date(),
      });
      user = { _id: result.insertedId, name: "Demo User", email: "demo@dreamnest.com", password: hashedPassword, role: "user", createdAt: new Date() };
    }

    const token = generateToken(user._id!, user.email);

    res.json({
      token,
      user: { id: user._id!.toString(), name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ error: "Demo login failed" });
  }
});

router.get("/me", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const user = await db.collection<User>("users").findOne(
      { _id: new ObjectId(req.user!.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: { id: user._id!.toString(), name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
