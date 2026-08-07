import { NextRequest, NextResponse } from "next/server";

const capabilities = [
  {
    type: "tender_document",
    label: "投标文件",
    status: "reserved",
    plannedWorkflow: ["招标文件解析", "响应矩阵", "证明材料确认", "目录确认", "分章生成", "合规审查", "DOCX 导出"],
  },
  {
    type: "planning_report",
    label: "规划文本报告",
    status: "reserved",
    plannedWorkflow: ["规划任务定义", "资料盘点", "指标体系", "项目库", "目录确认", "分章生成", "一致性审查", "DOCX 导出"],
  },
] as const;

export function GET() {
  return NextResponse.json({ enabled: false, capabilities, apiVersion: "v1-reserved" });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { type?: unknown } | null;
  const knownType = capabilities.some((item) => item.type === body?.type);
  return NextResponse.json({
    error: knownType ? "复杂文档项目功能已预留，当前版本尚未开放创建" : "不支持的复杂文档项目类型",
    code: knownType ? "FEATURE_RESERVED" : "INVALID_PROJECT_TYPE",
    capabilities,
  }, { status: knownType ? 501 : 400 });
}
