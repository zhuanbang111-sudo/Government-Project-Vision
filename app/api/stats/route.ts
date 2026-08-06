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
    const documentCount = documents?.count ?? 0;
    const generatedCount = generations?.count ?? 0;
    return NextResponse.json({ documentCount, generatedCount, docCount: documentCount, genCount: generatedCount });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
