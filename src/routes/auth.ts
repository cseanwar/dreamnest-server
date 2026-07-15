import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db";
import { User } from "../types";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

function generateToken(userId: ObjectId, email: string, role: string): string {
  return jwt.sign({ userId: userId.toString(), email, role }, JWT_SECRET, { expiresIn: "7d" });
}

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

router.post("/register", validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    const db = await getDB();
    const existing = await db.collection<User>("users").findOne({ email: email.toLowerCase() });

    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const userCount = await db.collection<User>("users").countDocuments();
    const role = userCount === 0 ? "admin" : "user";

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await db.collection<User>("users").insertOne({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      createdAt: new Date(),
    });

    const token = generateToken(result.insertedId, email.toLowerCase(), role);

    res.status(201).json({
      token,
      user: { id: result.insertedId.toString(), name, email: email.toLowerCase(), role },
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

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

    const token = generateToken(user._id!, user.email, user.role);

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

    const token = generateToken(user._id!, user.email, user.role);

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

    res.json({ user: { id: user._id!.toString(), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  email: z.string().email("Invalid email").optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").max(128),
});

export { updateProfileSchema, updatePasswordSchema };

export default router;
