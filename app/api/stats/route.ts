import { NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";

export async function GET() {
  try {
    const db = await getDatabase();
    const [documents, generations] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM documents").first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) AS count FROM generations").first<{ count: number }>(),
    ]);
    return NextResponse.json({ documentCount: documents?.count ?? 0, generatedCount: generations?.count ?? 0 });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
