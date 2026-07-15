import { config } from "dotenv";
import { MongoClient } from "mongodb";

config();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("dreamnest");

  const result = await db.collection("users").updateOne(
    { email: email.toLowerCase() },
    { $set: { role: "admin" } }
  );

  if (result.matchedCount === 0) {
    console.error(`User with email "${email}" not found`);
    await client.close();
    process.exit(1);
  }

  console.log(`Promoted ${email} to admin (${result.modifiedCount} modified)`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
