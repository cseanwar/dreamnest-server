import { ObjectId } from "mongodb";

export interface User {
  _id?: ObjectId;
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  createdAt: Date;
}

export interface Property {
  _id?: ObjectId;
  title: string;
  description: string;
  fullDescription: string;
  price: number;
  location: string;
  images: string[];
  category: "house" | "apartment" | "villa" | "condo" | "office" | "land";
  type: "sale" | "rent";
  bedrooms: number;
  bathrooms: number;
  area: number;
  rating: number;
  userId: ObjectId;
  featured?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactMessage {
  _id?: ObjectId;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
}
