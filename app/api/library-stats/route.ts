import { NextResponse } from "next/server";
import { documentTypeLabel } from "../../knowledge";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";

type CountRow = { count: number };
type DistributionRow = { name: string | null; count: number };

export async function GET() {
  try {
    const db = await getDatabase();
    const [total, facts, vectorized, recent, departments, types] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM documents").first<CountRow>(),
      db.prepare("SELECT COUNT(*) AS count FROM documents WHERE usage_tags LIKE '%\"facts\"%'").first<CountRow>(),
      db.prepare("SELECT COUNT(*) AS count FROM documents WHERE vector_status = 'ready'").first<CountRow>(),
      db.prepare("SELECT COUNT(*) AS count FROM documents WHERE created_at >= datetime('now', '-7 days')").first<CountRow>(),
      db.prepare("SELECT department AS name, COUNT(*) AS count FROM documents GROUP BY department ORDER BY count DESC LIMIT 8").all<DistributionRow>(),
      db.prepare("SELECT document_type AS name, COUNT(*) AS count FROM documents GROUP BY document_type ORDER BY count DESC").all<DistributionRow>(),
    ]);
    const documentsTotal = total?.count ?? 0;
    return NextResponse.json({
      corpusCount: documentsTotal,
      statsDbCount: facts?.count ?? 0,
      deptFuncCount: 0,
      vectorizedTotal: vectorized?.count ?? 0,
      documentsTotal,
      departmentDistribution: departments.results.map((item) => ({ name: item.name || "未分类", count: item.count })),
      industryDistribution: [],
      docTypeDistribution: types.results.map((item) => ({ name: documentTypeLabel(item.name || "other"), count: item.count })),
      recent7DaysCount: recent?.count ?? 0,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
