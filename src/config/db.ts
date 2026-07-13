import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = "dreamnest";

let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log("Connected to MongoDB");

  await createIndexes(db);

  return db;
}

export function getDB(): Db {
  if (!db) throw new Error("Database not initialized. Call connectDB() first.");
  return db;
}

export async function closeDB(): Promise<void> {
  if (client) await client.close();
}

async function createIndexes(db: Db): Promise<void> {
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("properties").createIndex({ userId: 1 });
  await db.collection("properties").createIndex({ title: "text", description: "text" });
}
