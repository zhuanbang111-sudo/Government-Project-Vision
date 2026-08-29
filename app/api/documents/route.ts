import { NextRequest, NextResponse } from "next/server";
import { normalizeDocumentType, normalizeUsageTags } from "../../knowledge";
import { errorMessage } from "../_shared";
import { getDatabase } from "../_platform";
import { documentScope, identityError, resolveIdentity } from "../_identity";

export async function GET(request: NextRequest) {
  try {
    const documentType = request.nextUrl.searchParams.get("documentType");
    const usageTag = request.nextUrl.searchParams.get("usageTag");
    const status = request.nextUrl.searchParams.get("status");
    const query = request.nextUrl.searchParams.get("query")?.trim();
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const scope = documentScope(identity, "documents");
    const conditions: string[] = ["workspace_id = ?", "deleted_at IS NULL", scope.sql];
    const bindings: unknown[] = [identity.workspaceId];
    bindings.push(...scope.bindings);
    if (documentType && documentType !== "all") {
      conditions.push("document_type = ?");
      bindings.push(normalizeDocumentType(documentType));
    }
    if (usageTag && normalizeUsageTags([usageTag]).length) {
      conditions.push("usage_tags LIKE ?");
      bindings.push(`%\"${usageTag}\"%`);
    }
    if (status && ["ready", "failed", "disabled"].includes(status)) {
      conditions.push("processing_status = ?");
      bindings.push(status);
    }
    if (query) {
      conditions.push("(filename LIKE ? OR department LIKE ? OR topic_tags LIKE ?)");
      const term = `%${query.slice(0, 100)}%`;
      bindings.push(term, term, term);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { results } = await db.prepare(
      `SELECT id, filename, file_type, file_size, department, document_type, usage_tags, topic_tags,
              processing_status, vector_status, verification_status, visibility, owner_user_id, department_id, created_at, updated_at
       FROM documents ${where} ORDER BY created_at DESC LIMIT 500`,
    ).bind(...bindings).all();
    return NextResponse.json(results);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}
