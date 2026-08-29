import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";
import { resolveIdentity } from "../_identity";

export async function GET(request: NextRequest) {
  try { const db = await getDatabase(); await resolveIdentity(request, db); return NextResponse.json((await db.prepare("SELECT * FROM paragraph_types ORDER BY id ASC").all()).results); }
  catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
