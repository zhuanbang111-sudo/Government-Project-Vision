import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { errorMessage } from "../_shared";

export async function GET() {
  try {
    const db = new Database(path.join(process.cwd(), "data", "database.db"));
    try {
      return NextResponse.json(db.prepare("SELECT * FROM paragraph_types ORDER BY id ASC").all());
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
