import { NextRequest, NextResponse } from "next/server";
import { documentTypeLabel } from "../../knowledge";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";
import { identityError, resolveIdentity } from "../_identity";

type CountRow = { count: number };
type DistributionRow = { name: string | null; count: number };

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const scope = "workspace_id = ? AND deleted_at IS NULL";
    const [total, facts, vectorized, recent, departments, types] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE ${scope}`).bind(identity.workspaceId).first<CountRow>(),
      db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE ${scope} AND usage_tags LIKE '%\"facts\"%'`).bind(identity.workspaceId).first<CountRow>(),
      db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE ${scope} AND vector_status = 'ready'`).bind(identity.workspaceId).first<CountRow>(),
      db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE ${scope} AND created_at >= datetime('now', '-7 days')`).bind(identity.workspaceId).first<CountRow>(),
      db.prepare(`SELECT department AS name, COUNT(*) AS count FROM documents WHERE ${scope} GROUP BY department ORDER BY count DESC LIMIT 8`).bind(identity.workspaceId).all<DistributionRow>(),
      db.prepare(`SELECT document_type AS name, COUNT(*) AS count FROM documents WHERE ${scope} GROUP BY document_type ORDER BY count DESC`).bind(identity.workspaceId).all<DistributionRow>(),
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
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}
