import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// 载入环境变量
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      const value = values.join("=");
      if (key && value) process.env[key.trim()] = value.trim().replace(/^['"]|['"]$/g, "");
    }
  });
}

const dbPath = path.join(process.cwd(), "data", "database.db");
const db = new Database(dbPath);

async function backfill() {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.error("错误: 未配置 ZHIPU_API_KEY，无法补跑向量数据");
    process.exit(1);
  }

  // 查询所有向量数据为空的旧文档记录
  const pendingDocs = db.prepare(`
    SELECT id, filename, content FROM documents 
    WHERE vector_data IS NULL OR vector_data = ''
  `).all() as { id: number; filename: string; content: string }[];

  if (pendingDocs.length === 0) {
    console.log("没有需要补跑向量数据的公文记录。");
    db.close();
    return;
  }

  console.log(`发现有 ${pendingDocs.length} 篇历史公文未进行向量嵌入，正在开始批量补跑...`);

  for (const doc of pendingDocs) {
    console.log(`[正在处理] -> ${doc.filename}...`);
    try {
      const croppedText = doc.content.substring(0, 4000);
      const res = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: "embedding-3", input: croppedText }),
      });

      if (!res.ok) throw new Error(`智谱接口响应异常，状态码 ${res.status}`);
      const data = await res.json();
      const embedding = data.data?.[0]?.embedding;

      if (!embedding) throw new Error("获取嵌入数据异常");

      // 更新数据库
      const update = db.prepare("UPDATE documents SET vector_data = ? WHERE id = ?");
      update.run(JSON.stringify(embedding), doc.id);
      console.log(`[更新成功]: ${doc.filename} 已完成向量化存储`);

      // 每次调用增加少量延时，防止触发智谱接口的 QPS 频控限制
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err: any) {
      console.error(`[补跑失败]: ${doc.filename} 解析出错: ${err.message}`);
    }
  }

  console.log("向量补跑任务执行结束。");
  db.close();
}

backfill();