import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { draftContent, selectedIds } = await request.json();

    if (!draftContent || !draftContent.trim()) {
      return NextResponse.json({ error: "草稿内容不能为空" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "服务器未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    }

    const dbPath = path.join(process.cwd(), "data", "database.db");
    const db = new Database(dbPath);

    // 1. 读取本次实际勾选的历史参考文档原文
    let referenceDocsText = "";
    if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
      const placeholders = selectedIds.map(() => "?").join(",");
      const docs = db.prepare(`
        SELECT filename, content FROM documents WHERE id IN (${placeholders})
      `).all(...selectedIds) as { filename: string; content: string }[];
      
      referenceDocsText = docs.map((d, i) => `[参考文件 ${i + 1} - ${d.filename}]\n${d.content}`).join("\n\n");
    }

    // 2. 读取完整的部门职能划分基线库
    const deptFunctions = db.prepare(`
      SELECT department_name, function_description FROM department_functions
    `).all() as { department_name: string; function_description: string }[];
    db.close();

    const deptFunctionsText = deptFunctions.map(item => {
      return `部门: ${item.department_name} | 职责范围基线: ${item.function_description}`;
    }).join("\n");

    // 3. 构建严格的4维度审查 System Prompt
    const systemPrompt = `你是一个极其严苛、眼里揉不得沙子的政务公文合规性审查专家。请对照提供的“部门职能基线”和“参考历史文件”，对用户提交的“公文草稿”进行深度合规审查。

你需要从以下四个维度进行全盘交叉核验，查找草稿中可能存在疑点或不一致的硬伤：

1. 职能职责：比对正文提到的部门职责，是否超出了“部门职能基线”中为该部门界定的职责边界。若越界或分工不符，必须指出。
2. 数据准确性：比对正文中出现的任何数字、比率、年份、金额，确认其是否完全在“参考历史文件”中存在支撑依据。若无支撑或数据打架，视为疑点。
3. 工作来源：审查正文中做出的各种事实或依据性表述，是否属于无源之水（大模型臆造），是否能从“参考历史文件”中推导出来。
4. 事件合理性：审查正文内部逻辑是否自相矛盾（如前文写3月检查、后文又写2月整改等逻辑或时间先后矛盾）。

请你务必只返回一个标准的 JSON 数组对象，不要包含 markdown 标记代码块 (如 \`\`\`json )，不要有任何多余的开头或结尾废话。
如果没有任何问题，请直接返回一个空数组：[]

JSON 数组单项格式要求：
[
  {
    "dimension": "职能职责" | "数据准确性" | "工作来源" | "事件合理性",
    "fragment": "草稿正文中原封不动出现的疑似问题的一小段文字（控制在20字内，必须与原文片段一字不差，用作定位）",
    "description": "详细指出该处有什么硬伤，并给出具体的修正参考意见"
  }
]`;

    const userPrompt = `【部门职能基线】
${deptFunctionsText ? deptFunctionsText : "（当前职能库无数据，跳过该维度比对）"}

【参考历史文件原文】
${referenceDocsText ? referenceDocsText : "（用户未提供参考范例）"}

【待审查的公文草稿正文】
${draftContent}`;

    // 向 DeepSeek 发起请求
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1, // 确保审查动作的确定性
      }),
    });

    if (!response.ok) {
      throw new Error(`审查组件连接异常，状态码 ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";

    // 格式清洗
    let cleanText = rawText.trim();
    if (cleanText.startsWith("```json")) cleanText = cleanText.substring(7);
    else if (cleanText.startsWith("```")) cleanText = cleanText.substring(3);
    if (cleanText.endsWith("```")) cleanText = cleanText.substring(0, cleanText.length - 3);

    const issues = JSON.parse(cleanText.trim());
    return NextResponse.json(issues);
  } catch (error: any) {
    console.error("审查服务出错:", error);
    return NextResponse.json({ error: error.message || "内部错误" }, { status: 500 });
  }
}