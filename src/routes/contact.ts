import { Router, Request, Response } from "express";
import { getDB } from "../config/db";
import { ContactMessage } from "../types";

const router = Router();

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      res.status(400).json({ error: "Name, email, and message are required" });
      return;
    }

    const db = getDB();
    const contactMessage: ContactMessage = {
      name,
      email,
      subject: subject || "",
      message,
      createdAt: new Date(),
    };

    await db.collection<ContactMessage>("contacts").insertOne(contactMessage);

    res.status(201).json({ message: "Message sent successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
