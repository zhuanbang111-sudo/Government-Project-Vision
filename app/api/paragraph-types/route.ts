import { NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";

export async function GET() {
  try { const db = await getDatabase(); return NextResponse.json((await db.prepare("SELECT * FROM paragraph_types ORDER BY id ASC").all()).results); }
  catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
