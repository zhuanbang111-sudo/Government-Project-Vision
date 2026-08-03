import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { docType, topic, selectedIds, points, newData } = await request.json();

    if (!docType || !topic || !points) {
      return NextResponse.json({ error: "参数不完整（文种、主题、要点为必填项）" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "服务器未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    }

    let referenceMaterials = "";

    // 若用户勾选了参考文件，从数据库调档并拼接原文
    if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
      const dbPath = path.join(process.cwd(), "data", "database.db");
      const db = new Database(dbPath);

      // 动态生成防注入占位符
      const placeholders = selectedIds.map(() => "?").join(",");
      const statement = db.prepare(`
        SELECT filename, content FROM documents WHERE id IN (${placeholders})
      `);

      const docs = statement.all(...selectedIds) as { filename: string; content: string }[];
      db.close();

      // 将调取的多个公文文本进行格式化合并
      referenceMaterials = docs.map((doc, idx) => {
        return `[参考材料 ${idx + 1} - 文件名: ${doc.filename}]\n${doc.content.substring(0, 3000)}`;
      }).join("\n\n");
    }

    // ==========================================
    // 强化 Prompt 设计：零虚构约束与格式隔离指示
    // ==========================================
    const systemPrompt = `你是一个高度严谨的政务公文辅助拟稿助手。请根据用户提供的参考公文与新增数据，融合撰写一篇全新公文。
请你严格遵守以下数据合规与来源约束规则（这是你的最高行为准则）：

1. 零虚构原则（严格防幻觉）：
   - 文中涉及的所有具体数字、年份、金额、百分比、人员姓名、机构名称，都必须能在参考历史文件或用户补充的新增数据中找到明确依据。
   - 严禁凭空编造、推测或根据常识脑补任何数据、事实、结论。
   - 如果某处写作逻辑强烈需要具体数据（例如：'2025年，我市共拨付专项资金 [数值] 万元'），但参考公文和新增数据中均没有提供对应数据，请你绝对不要瞎编，必须统一使用占位符 “【此处需补充具体数据】” 进行标注。

2. 新增数据标注：
   - 只要新公文的正文采信并引用了用户本次“补充的新增数据（历史文件中没有）”中的任何数据或细节，你必须在该处用方括号标明来源。例如：“根据最新统计【用户提供】，我市...”

3. 格式与风格：
   - 深度借鉴参考范例的用语风格、行文结构和逻辑排版，文风保持严谨专业。

4. 来源归属（严格按此格式结尾）：
   - 请在生成正文内容的最后，输出一行明确的文本分割标识：“--- 参考来源列表 ---”
   - 在该分割标识下方，列出本次撰写实际参考的范例文件名清单。格式如下：
     1. [文件名_A.docx]
     2. [文件名_B.pdf]`;

    // 明确划分历史材料、用户要点、本次新增数据三者界限
    const userPrompt = `【新公文任务信息】
拟写文种：${docType}
公文主题：${topic}
核心要点（必须在正文体现）：\n${points}

【以下是用户本次补充的新增数据（历史文件中没有）：】
${newData ? newData : "（用户未补充新增数据）"}

【以下是你可以参考的历史参考公文原文：】
${referenceMaterials ? referenceMaterials : "（用户未选择参考材料，请直接根据公文规范撰写新公文。）"}`;

    // 请求 DeepSeek
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
        temperature: 0.1, // 维持极低发散度，防止大模型自我发挥
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "接口调用异常");
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) throw new Error("大模型未返回内容");

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("generate-v2 错误:", error);
    return NextResponse.json({ error: error.message || "内部错误" }, { status: 500 });
  }
}