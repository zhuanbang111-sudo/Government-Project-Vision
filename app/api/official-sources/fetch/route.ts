import { NextRequest, NextResponse } from "next/server";
import { isOfficialGovernmentUrl } from "../../_official-sources";
import { OfficialSourceValidationError, validateAndStoreOfficialSource } from "../_source-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { url?: unknown; title?: unknown; topic?: unknown; outline?: unknown; section?: unknown; uses?: unknown };
    if (typeof body.url !== "string") return NextResponse.json({ error: "政府官网链接不能为空" }, { status: 400 });
    if (!isOfficialGovernmentUrl(body.url)) return NextResponse.json({ error: "仅允许提取使用 HTTPS 的中国政府部门官网（.gov.cn）链接" }, { status: 400 });
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
    const outline = Array.isArray(body.outline) ? body.outline.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 20) : [];
    const requestedSection = typeof body.section === "string" ? body.section.trim().slice(0, 120) : "";
    const result = await validateAndStoreOfficialSource({
      url: body.url,
      fallbackTitle: typeof body.title === "string" ? body.title : "",
      topic,
      outline,
      section: requestedSection,
      uses: body.uses,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("selected official source fetch failed", error);
    const status = error instanceof OfficialSourceValidationError ? 422 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "政府官网素材提取失败" }, { status });
  }
}
