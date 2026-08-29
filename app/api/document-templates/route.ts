import { NextRequest, NextResponse } from "next/server";
import { documentTemplates, getDocumentTemplate, ordinaryDocumentTypes, templateComponentsForClient } from "../../document-templates";
import { getDatabase } from "../_platform";
import { resolveIdentity } from "../_identity";

export async function GET(request: NextRequest) {
  await resolveIdentity(request, await getDatabase());
  const documentType = request.nextUrl.searchParams.get("documentType");
  const subtype = request.nextUrl.searchParams.get("subtype");
  if (documentType) {
    const template = getDocumentTemplate(documentType, subtype);
    return NextResponse.json({ ...template, components: templateComponentsForClient(template) });
  }
  return NextResponse.json({
    documentTypes: ordinaryDocumentTypes.map((type) => ({
      value: type,
      label: type,
      description: documentTemplates[type].description,
      logic: documentTemplates[type].logic,
      subtypes: documentTemplates[type].subtypes ?? [],
    })),
  });
}
