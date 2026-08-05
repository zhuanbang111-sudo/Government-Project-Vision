import { NextResponse } from "next/server";
import { errorMessage } from "../_shared";
import { getDatabase } from "../_platform";

export async function GET() {
  try {
    const db = await getDatabase();
    const { results } = await db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all();
    return NextResponse.json(results);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
