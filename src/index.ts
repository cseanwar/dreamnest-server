import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { connectDB, closeDB, getDB } from "./config/db";
import { User, Property } from "./types";
import authRoutes from "./routes/auth";
import propertyRoutes from "./routes/properties";
import contactRoutes from "./routes/contact";
import { authMiddleware } from "./middleware/auth";
import { requireRole } from "./middleware/role";
import { validate } from "./middleware/validate";
import { errorHandler } from "./middleware/errorHandler";
import { updateProfileSchema, updatePasswordSchema } from "./routes/auth";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();

const requiredEnv = ["MONGODB_URI", "JWT_SECRET"];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(morgan("short"));
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/", (_req, res) => {
  res.json({ name: "DreamNest API", version: "1.0.0", endpoints: ["/api/auth", "/api/properties", "/api/contact", "/api/admin", "/api/health"] });
});

app.use("/api/auth", authLimiter, authRoutes);

app.put("/api/auth/profile", authMiddleware, validate(updateProfileSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email } = req.body;
    const db = await getDB();
    const update: Record<string, unknown> = {};

    if (name !== undefined) update.name = name;
    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase();
      const existing = await db.collection<User>("users").findOne({
        email: normalizedEmail,
        _id: { $ne: new ObjectId(req.user!.userId) },
      });
      if (existing) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      update.email = normalizedEmail;
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    await db.collection<User>("users").updateOne(
      { _id: new ObjectId(req.user!.userId) },
      { $set: update }
    );

    const updatedUser = await db.collection<User>("users").findOne(
      { _id: new ObjectId(req.user!.userId) },
      { projection: { password: 0 } }
    );

    const token = jwt.sign(
      { userId: updatedUser!._id!.toString(), email: updatedUser!.email, role: updatedUser!.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: updatedUser!._id!.toString(), name: updatedUser!.name, email: updatedUser!.email, role: updatedUser!.role },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.put("/api/auth/password", authMiddleware, validate(updatePasswordSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = await getDB();
    const user = await db.collection<User>("users").findOne(
      { _id: new ObjectId(req.user!.userId) }
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.collection<User>("users").updateOne(
      { _id: new ObjectId(req.user!.userId) },
      { $set: { password: hashedPassword } }
    );

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update password" });
  }
});

app.use("/api/properties", propertyRoutes);
app.use("/api/contact", contactRoutes);

function adminGuard(req: Request, res: Response, next: express.NextFunction): void {
  authMiddleware(req, res, () => {
    requireRole("admin")(req, res, next);
  });
}

app.get("/api/admin/stats", adminGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const [totalUsers, totalProperties, categoryStats] = await Promise.all([
      db.collection<User>("users").countDocuments(),
      db.collection<Property>("properties").countDocuments(),
      db.collection<Property>("properties").aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    res.json({
      stats: { totalUsers, totalProperties, categories: categoryStats },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/api/admin/users", adminGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const users = await db.collection<User>("users")
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      users: users.map((u) => ({
        id: u._id!.toString(), name: u.name, email: u.email, role: u.role, createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.delete("/api/admin/users/:id", adminGuard, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (id === req.user!.userId) {
      res.status(400).json({ error: "Cannot delete yourself" });
      return;
    }

    const db = await getDB();
    const user = await db.collection<User>("users").findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.email === "anwar@dreamnest.com") {
      res.status(403).json({ error: "Cannot delete main admin" });
      return;
    }

    await db.collection<User>("users").deleteOne({ _id: new ObjectId(id) });
    await db.collection<Property>("properties").deleteMany({ userId: new ObjectId(id) });

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.patch("/api/admin/users/:id/role", adminGuard, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { role } = req.body;
    if (!role || !["user", "admin"].includes(role)) {
      res.status(400).json({ error: "Role must be 'user' or 'admin'" });
      return;
    }

    const db = await getDB();
    const user = await db.collection<User>("users").findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password: 0 } }
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.email === "anwar@dreamnest.com" && role !== "admin") {
      res.status(403).json({ error: "Cannot change main admin role" });
      return;
    }

    await db.collection<User>("users").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } }
    );

    res.json({
      user: { id: user._id!.toString(), name: user.name, email: user.email, role, createdAt: user.createdAt },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user role" });
  }
});

app.get("/api/admin/properties", adminGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const properties = await db.collection<Property>("properties")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      properties: properties.map((p) => ({
        id: p._id!.toString(), title: p.title, price: p.price, location: p.location,
        category: p.category, type: p.type, userId: p.userId.toString(), createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

app.delete("/api/admin/properties/:id", adminGuard, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const property = await db.collection<Property>("properties").findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    await db.collection<Property>("properties").deleteOne(
      { _id: new ObjectId(req.params.id) }
    );

    res.json({ message: "Property deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete property" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await closeDB();
  process.exit(0);
});

if (!process.env.VERCEL) {
  start();
}

export default app;
