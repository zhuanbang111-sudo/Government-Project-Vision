import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import path from "path";
import Database from "better-sqlite3";

const dbPath = path.join(process.cwd(), "data", "database.db");

interface KnowledgeAsset {
  knowledge_type: 'document' | 'fact' | 'policy' | 'department_rule' | 'case' | 'template';
  title: string;
  content: string;
}

// 自动后台检索知识库资产
function autoRetrieveKnowledgeAssets(topic: string, points: string): KnowledgeAsset[] {
  const assets: KnowledgeAsset[] = [];
  let db;
  
  try {
    db = new Database(dbPath);
    // 将主题和要点切分为基础关键词组进行模糊查询
    const cleanKeywords = [
      topic,
      ...points.split(/[,，;；.。、\s]+/)
    ].map(k => k.trim()).filter(k => k.length > 1);

    const selectQuery = db.prepare(`
      SELECT knowledge_type, title, content 
      FROM knowledge_assets 
      WHERE title LIKE ? OR content LIKE ?
      LIMIT 6
    `);

    const seenKeys = new Set<string>();

    // 针对每个关键词搜索高度相关的政策、数据、规范和案例
    for (const kw of cleanKeywords.slice(0, 4)) {
      const results = selectQuery.all(`%${kw}%`, `%${kw}%`) as any[];
      for (const row of results) {
        const uniqueKey = `${row.knowledge_type}-${row.title}`;
        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          assets.push({
            knowledge_type: row.knowledge_type,
            title: row.title,
            content: row.content
          });
        }
      }
    }

    // 兜底机制：若未检索到关键词相关资产，则自动调取最新录入的政策、规则和指标作为大模型参考基准
    if (assets.length === 0) {
      const fallbackQuery = db.prepare(`
        SELECT knowledge_type, title, content 
        FROM knowledge_assets 
        ORDER BY created_at DESC 
        LIMIT 6
      `);
      const fallbackResults = fallbackQuery.all() as any[];
      for (const row of fallbackResults) {
        assets.push({
          knowledge_type: row.knowledge_type,
          title: row.title,
          content: row.content
        });
      }
    }
  } catch (error) {
    console.error("后台检索知识资产库异常:", error);
  } finally {
    if (db) db.close();
  }

  return assets;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 获取前端发送的表单数据
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("docType") as string;
    const topic = formData.get("topic") as string;
    const points = formData.get("points") as string;

    // 验证必要参数是否存在
    if (!file || !docType || !topic || !points) {
      return NextResponse.json(
        { error: "请填写所有必要的信息并上传历史公文" },
        { status: 400 }
      );
    }

    // 2. 将上传的文件转换为 Buffer 并提取 .docx 原材料，将其作为首要写作风格范本
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mammothResult = await mammoth.extractRawText({ buffer });
    const historicalText = mammothResult.value;

    if (!historicalText.trim()) {
      return NextResponse.json(
        { error: "未能从上传的文档中提取到有效文字" },
        { status: 400 }
      );
    }

    // 3. 触发统一知识资产库后台智能检索（获取事实数据、职责、政策规章）
    const retrievedAssets = autoRetrieveKnowledgeAssets(topic, points);

    // 将用户自主上传的范本加入作为 template / document 类型参考
    retrievedAssets.push({
      knowledge_type: "template",
      title: `用户手动上传的历史公文范本_${file.name}`,
      content: historicalText
    });

    // 4. 检查环境变量中是否存在 DeepSeek API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "系统未配置 DEEPSEEK_API_KEY 环境变量" },
        { status: 500 }
      );
    }

    // 5. 分门别类整理 XML 输入内容，严格遵循政务四大铁律
    const facts = retrievedAssets.filter(a => a.knowledge_type === 'fact');
    const policies = retrievedAssets.filter(a => a.knowledge_type === 'policy');
    const rules = retrievedAssets.filter(a => a.knowledge_type === 'department_rule');
    const documents = retrievedAssets.filter(a => a.knowledge_type === 'document');
    const templates = retrievedAssets.filter(a => a.knowledge_type === 'template');
    const cases = retrievedAssets.filter(a => a.knowledge_type === 'case');

    const writingTask = `
类型: ${docType}
主题: ${topic}
核心要点: ${points}
`;

    // 高度结构化、防幻觉、防职责混乱的政务 Prompt
    const finalPrompt = `
你是一位精通中国政府公文、汇报材料、政策方案编制的【国家部委级资深公文顾问与秘书长】。
现在，请你根据提供的高价值【统一知识资产】和【材料编制任务】，起草一份结构严密、逻辑严谨、用词极为规范、具有高度政策说服力的专业公文草稿。

====================【核心输入数据】====================
<writing_task>
${writingTask.trim()}
</writing_task>

<knowledge_assets>
  <fact_assets>
    <!-- 所有事实数据、统计指标、核心数值必须从此区域提取，严禁凭空想象 -->
    ${facts.map((f, i) => `[事实${i + 1}] 标题: ${f.title}\n内容: ${f.content}`).join('\n\n') || '（无特定事实数据输入，行文中请勿出现不确切的具体统计数字）'}
  </fact_assets>

  <policy_assets>
    <!-- 所有的政策引用、上位法依据、指导意见必须从此区域提取 -->
    ${policies.map((p, i) => `[政策${i + 1}] 标题: ${p.title}\n内容: ${p.content}`).join('\n\n') || '（无指导性政策依据输入，行文时需使用通用的、大方向正确的政治表述）'}
  </policy_assets>

  <department_rule_assets>
    <!-- 涉及各部门、处室的职责分工、定岗分工、业务范畴，必须以此区域为准 -->
    ${rules.map((r, i) => `[职责规则${i + 1}] 标题: ${r.title}\n内容: ${r.content}`).join('\n\n') || '（无职责规则输入，行文中请用模糊、统筹协作的集体词汇，严禁点名指派职责）'}
  </department_rule_assets>

  <reference_documents_and_cases>
    <!-- 表述风格、行业话语体系及优秀案例做法，可以参考此区域 -->
    ${[...documents, ...cases].map((d, i) => `[参考资产${i + 1}] 标题: ${d.title}\n内容: ${d.content}`).join('\n\n') || '（无特定表述参考）'}
  </reference_documents_and_cases>

  <standard_templates>
    <!-- 公文结构与行文框架可参考以下模板（已包含用户上传的历史范文） -->
    ${templates.map((t, i) => `[模板${i + 1}] 标题: ${t.title}\n内容: ${t.content}`).join('\n\n') || '（采用标准的党政公文三分法或总分总逻辑结构）'}
  </standard_templates>
</knowledge_assets>

====================【四大铁律（绝对红线）】====================
1. 🛑【数据铁律】: 
   - 起草的公文中，所有的事实数据、统计指标、历史数值，必须100%源于 <fact_assets> 中包含的真实数据。
   - 严禁自行编造任何数字（如增长率、具体吨位、千米数、投资金额等）。如果任务要求提到某数据但资产库中不存在，请以“【具体数据待填充】”占位，不得胡编乱造。
   
2. 🛑【职责铁律】: 
   - 凡是涉及到各业务部门（如：城建处、规划处、协调处等）职责划分、统筹分工的表述，必须严格尊重 <department_rule_assets> 中的权责划分。
   - 严禁产生职责混淆或将A处的职责指派给B处。

3. 🛑【政策铁律】: 
   - 公文中引用的政策文件、上位法依据，必须来自 <policy_assets> 中的对应条目。
   - 引用时需精准呈现政策名称（如“根据《xxxx管理办法》第xx条”），严禁杜撰不存在的政策。

4. 🛑【风格铁律】: 
   - 必须遵循中国政府机关的写作范式（即“公文风”）。
   - 要求：措辞客观公允、高屋建瓴、字斟句酌、不偏不倚，具有高度的政治站位。多使用政府特有的四字成语、规范性表述和整齐的排比句。
   - 严格参考 <standard_templates> 的段落过渡句和逻辑结构。

====================【思考链与生成格式要求】====================
在输出最终公文前，请在你的回答最开始，通过 <thought_process> 标签进行自我审查（字数控制在200字以内），交代：
1. 引用了哪些核心事实数据？
2. 引用了哪些处室职责？
3. 引用了哪些政策文件？

完成自查后，请直接在 <official_document> 标签中输出正式的公文全文。
`.trim();

    // 6. 调用 DeepSeek API
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: finalPrompt }],
        temperature: 0.2, // 低采样温度，强化内容准确性与严谨度
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "DeepSeek 接口调用失败");
    }

    const data = await response.json();
    let generatedText = data.choices?.[0]?.message?.content;

    if (!generatedText) {
      throw new Error("DeepSeek 接口未返回有效文本");
    }

    // 7. 提取 <official_document> 标签内的公文主体（如果有），并清理不必要的 XML 标签，让输出纯净整洁
    if (generatedText.includes("<official_document>")) {
      const parts = generatedText.split("<official_document>");
      const contentPart = parts[1] || "";
      generatedText = contentPart.split("</official_document>")[0] || contentPart;
    } else if (generatedText.includes("</thought_process>")) {
      generatedText = generatedText.split("</thought_process>")[1] || generatedText;
    }

    // 返回生成的公文内容，接口格式100%匹配老版，完美向下兼容
    return NextResponse.json({ text: generatedText.trim() });
  } catch (error: any) {
    console.error("生成出错:", error);
    return NextResponse.json(
      { error: error.message || "服务器内部错误，生成失败" },
      { status: 500 }
    );
  }
}