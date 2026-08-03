import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

// 纯 JS 实现的余弦相似度计算逻辑（不依赖外部 c++ 库）
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query || !query.trim()) {
      return NextResponse.json({ error: "搜索词不能为空" }, { status: 400 });
    }

    const zhipuKey = process.env.ZHIPU_API_KEY;
    if (!zhipuKey) {
      return NextResponse.json({ error: "服务器未配置 ZHIPU_API_KEY 环境变量" }, { status: 500 });
    }

    // 1. 将用户输入的搜索文本，通过智谱接口转化为检索向量
    const embedRes = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${zhipuKey}`,
      },
      body: JSON.stringify({ model: "embedding-3", input: query.trim() }),
    });

    if (!embedRes.ok) {
      throw new Error(`智谱向量转化故障，状态码 ${embedRes.status}`);
    }

    const embedData = await embedRes.json();
    const queryVector = embedData.data?.[0]?.embedding as number[] | undefined;

    if (!queryVector) {
      throw new Error("智谱未能正常提取搜索词向量");
    }

    // 2. 从本地 SQLite 读取所有已进行了向量化存储的公文
    const dbPath = path.join(process.cwd(), "data", "database.db");
    const db = new Database(dbPath);
    const documents = db.prepare(`
      SELECT id, filename, department, doc_type, content, vector_data 
      FROM documents 
      WHERE vector_data IS NOT NULL AND vector_data != ''
    `).all() as { id: number; filename: string; department: string; doc_type: string; content: string; vector_data: string }[];

    db.close();

    // 3. 在内存中逐个计算余弦相似度并排序
    const searchResults = documents
      .map((doc) => {
        const docVector = JSON.parse(doc.vector_data) as number[];
        const similarity = calculateCosineSimilarity(queryVector, docVector);
        return {
          id: doc.id,
          filename: doc.filename,
          department: doc.department || "未知",
          doc_type: doc.doc_type || "未知",
          content: doc.content,
          score: Number(similarity.toFixed(4)), // 保留4位小数
        };
      })
      // 过滤掉低于 0.3 的弱语义关联数据，并按相似度由高到低降序排列
      .filter((item) => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      // 截取相关度最高的 8 篇文档
      .slice(0, 8);

    return NextResponse.json(searchResults);
  } catch (err: any) {
    console.error("搜索失败:", err);
    return NextResponse.json({ error: err.message || "内部错误" }, { status: 500 });
  }
}