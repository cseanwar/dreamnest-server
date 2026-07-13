import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB, closeDB } from "./config/db";
import authRoutes from "./routes/auth";
import propertyRoutes from "./routes/properties";
import contactRoutes from "./routes/contact";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "DreamNest API", version: "1.0.0", endpoints: ["/api/auth", "/api/properties", "/api/contact", "/api/health"] });
});

app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/contact", contactRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

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
