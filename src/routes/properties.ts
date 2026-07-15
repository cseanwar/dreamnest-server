import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { Property } from "../types";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const { search, category, type, minPrice, maxPrice, sort, page = "1", limit = "12" } = req.query;

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    if (category) filter.category = category;
    if (type) filter.type = type;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) (filter.price as Record<string, unknown>).$gte = Number(minPrice);
      if (maxPrice) (filter.price as Record<string, unknown>).$lte = Number(maxPrice);
    }

    let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === "price_asc") sortOption = { price: 1 };
    else if (sort === "price_desc") sortOption = { price: -1 };
    else if (sort === "rating") sortOption = { rating: -1 };
    else if (sort === "oldest") sortOption = { createdAt: 1 };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [properties, total] = await Promise.all([
      db.collection<Property>("properties")
        .find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection<Property>("properties").countDocuments(filter),
    ]);

    res.json({
      properties: properties.map((p) => ({ ...p, id: p._id!.toString() })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

router.get("/stats/category", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const results = await db.collection("properties").aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]).toArray();
    res.json({ categories: results });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category stats" });
  }
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const property = await db.collection<Property>("properties").findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    res.json({ ...property, id: property._id!.toString() });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch property" });
  }
});

router.post("/", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, fullDescription, price, location, images, category, type, bedrooms, bathrooms, area } = req.body;

    if (!title || !price || !location || !category || !type) {
      res.status(400).json({ error: "Title, price, location, category, and type are required" });
      return;
    }

    const db = await getDB();
    const property: Property = {
      title,
      description: description || "",
      fullDescription: fullDescription || "",
      price: Number(price),
      location,
      images: images || [],
      category,
      type,
      bedrooms: Number(bedrooms) || 0,
      bathrooms: Number(bathrooms) || 0,
      area: Number(area) || 0,
      rating: 0,
      userId: new ObjectId(req.user!.userId),
      featured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<Property>("properties").insertOne(property);

    res.status(201).json({ ...property, id: result.insertedId.toString() });
  } catch (error) {
    res.status(500).json({ error: "Failed to create property" });
  }
});

router.put("/:id", authMiddleware, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const property = await db.collection<Property>("properties").findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    if (property.userId.toString() !== req.user!.userId && req.user!.role !== "admin") {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const { title, description, fullDescription, price, location, images, category, type, bedrooms, bathrooms, area } = req.body;

    const update: Partial<Property> = { updatedAt: new Date() };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (fullDescription !== undefined) update.fullDescription = fullDescription;
    if (price !== undefined) update.price = Number(price);
    if (location !== undefined) update.location = location;
    if (images !== undefined) update.images = images;
    if (category !== undefined) update.category = category;
    if (type !== undefined) update.type = type;
    if (bedrooms !== undefined) update.bedrooms = Number(bedrooms);
    if (bathrooms !== undefined) update.bathrooms = Number(bathrooms);
    if (area !== undefined) update.area = Number(area);

    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );

    const updated = await db.collection<Property>("properties").findOne(
      { _id: new ObjectId(req.params.id) }
    );

    res.json({ ...updated, id: updated!._id!.toString() });
  } catch (error) {
    res.status(500).json({ error: "Failed to update property" });
  }
});

router.delete("/:id", authMiddleware, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const db = await getDB();
    const property = await db.collection<Property>("properties").findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    if (property.userId.toString() !== req.user!.userId && req.user!.role !== "admin") {
      res.status(403).json({ error: "Not authorized" });
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

export default router;
