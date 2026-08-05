import { NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";

export async function GET() {
  try {
    const db = await getDatabase();
    const { results } = await db.prepare("SELECT library_type, COUNT(*) AS count FROM documents GROUP BY library_type").all<{ library_type: string; count: number }>();
    return NextResponse.json(results);
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
