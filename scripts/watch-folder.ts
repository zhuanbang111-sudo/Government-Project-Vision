import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import mammoth from "mammoth";
import { createRequire } from "module";

const requireCjs = createRequire(import.meta.url);
const pdfParser = requireCjs("pdf-parse");
const XLSX = requireCjs("xlsx");

// ==========================================
// 辅助逻辑：自动载入 .env.local 中的环境变量
// ==========================================
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      const value = values.join("=");
      if (key && value) {
        process.env[key.trim()] = value.trim().replace(/^['"]|['"]$/g, "");
      }
    }
  });
}

const incomingDir = path.join(process.cwd(), "data", "incoming");
const processedDir = path.join(process.cwd(), "data", "processed");
const dbPath = path.join(process.cwd(), "data", "database.db");

// 确保父目录存在
if (!fs.existsSync(incomingDir)) fs.mkdirSync(incomingDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

// 确保子业务分类目录存在
const subDirs = ["语料库", "统计数据库"];
subDirs.forEach((dir) => {
  const incSub = path.join(incomingDir, dir);
  const proSub = path.join(processedDir, dir);
  if (!fs.existsSync(incSub)) fs.mkdirSync(incSub, { recursive: true });
  if (!fs.existsSync(proSub)) fs.mkdirSync(proSub, { recursive: true });
});

const db = new Database(dbPath);

// 智谱 AI 文本向量生成器
async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) return null;
  try {
    const croppedText = text.substring(0, 4000);
    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "embedding-3", input: croppedText }),
    });
    if (!response.ok) throw new Error(`状态码 ${response.status}`);
    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (err: any) {
    console.error(`[向量生成失败]: ${err.message}`);
    return null;
  }
}

// DeepSeek 智能分类器（已更新模型名称为 deepseek-v4-flash）
async function classifyDocument(content: string) {
  const defaultMeta = { department: "未知", industry: "未知", doc_type: "未知", doc_date: "未知", function: "未知" };
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return defaultMeta;
  try {
    const systemPrompt = `你是一个专业的政务公文分类助手。请阅读用户提供的公文文本，提取五个字段的信息，并严格以指定的纯 JSON 格式返回。不要包含 markdown 标记代码块 (如 \`\`\`json )。`;
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash", // 替换为当前有效的快速模型
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: content.substring(0, 4000) }],
        temperature: 0.1,
      }),
    });
    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";
    let cleanText = rawText.trim();
    if (cleanText.startsWith("```json")) cleanText = cleanText.substring(7);
    else if (cleanText.startsWith("```")) cleanText = cleanText.substring(3);
    if (cleanText.endsWith("```")) cleanText = cleanText.substring(0, cleanText.length - 3);
    return JSON.parse(cleanText.trim());
  } catch {
    return defaultMeta;
  }
}

// 统一提取移动归档逻辑
function archiveFile(src: string, dest: string) {
  try {
    // 确保目标备份目录的父文件夹已建好
    const destParent = path.dirname(dest);
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true });
    }
    fs.renameSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

// 核心处理链条（支持分库归集）
async function processFile(filePath: string) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();

  if (ext !== ".docx" && ext !== ".pdf" && ext !== ".xlsx" && ext !== ".xls") return;

  console.log(`\n[正在处理]: 发现新文档 -> ${filename}`);

  // ==========================================
  // 自适应逻辑：根据文件所在目录判定 library_type 归属
  // ==========================================
  const relativePath = path.relative(incomingDir, filePath);
  const pathParts = relativePath.split(path.sep);
  let libraryType = "语料库"; // 缺省默认值

  if (pathParts[0] === "统计数据库") {
    libraryType = "统计数据库";
  }

  // 计算归档的 processed 目标物理路径（按库类型分子文件夹隔离）
  let targetFileName = filename;
  let targetSubDir = libraryType;
  if (ext === ".xlsx" || ext === ".xls") {
    targetSubDir = ""; // Excel职责表直接归于根目录，维持原样
  }

  let targetPath = path.join(processedDir, targetSubDir, targetFileName);
  if (fs.existsSync(targetPath)) {
    const extName = path.extname(filename);
    const baseName = path.basename(filename, extName);
    targetFileName = `${baseName}_${Date.now()}${extName}`;
    targetPath = path.join(processedDir, targetSubDir, targetFileName);
  }

  try {
    // 职责表格 Excel 分支
    if (ext === ".xlsx" || ext === ".xls") {
      console.log(`[Excel 模式]: 正在读取和结构化解析职责表...`);
      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      let insertedCount = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const deptName = row[0] ? String(row[0]).trim() : "";
        const funcDesc = row[1] ? String(row[1]).trim() : "";

        if (!deptName || !funcDesc) {
          continue;
        }

        const insertStatement = db.prepare(`
          INSERT INTO department_functions (department_name, function_description, source_file)
          VALUES (?, ?, ?)
        `);
        insertStatement.run(deptName, funcDesc, filename);
        insertedCount++;
      }

      archiveFile(filePath, targetPath);
      console.log(`[处理完成]: ${filename} 已入库并移动归档。`);
      return;
    }

    // Word / PDF 归集与向量化分支
    const fileBuffer = fs.readFileSync(filePath);
    let contentText = "";
    let fileType = "";

    if (ext === ".docx") {
      fileType = "docx";
      const mammothResult = await mammoth.extractRawText({ buffer: fileBuffer });
      contentText = mammothResult.value;
    } else if (ext === ".pdf") {
      fileType = "pdf";
      try {
        const pdfData = await pdfParser(fileBuffer);
        contentText = pdfData.text;
      } catch (pdfErr: any) {
        throw new Error(`PDF文件解析故障: ${pdfErr.message}`);
      }
    }

    if (!contentText || contentText.trim().replace(/\s+/g, "").length < 30) {
      console.warn(`[跳过入库]: ${filename} 可能是扫描版PDF，已直接归档。`);
      archiveFile(filePath, targetPath);
      return;
    }

    console.log(`[分类分析]: 正在调用 DeepSeek 分析特征元数据...`);
    const meta = await classifyDocument(contentText);

    console.log(`[向量转化]: 正在生成高维特征向量...`);
    const embedding = await getEmbedding(contentText);
    const vectorString = embedding ? JSON.stringify(embedding) : null;

    // 存入 SQLite 并写入正确的 library_type 字段
    const insertStatement = db.prepare(`
      INSERT INTO documents (filename, file_path, file_type, content, department, industry, doc_type, date, function_tag, vector_data, library_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStatement.run(
      filename,
      targetPath,
      fileType,
      contentText,
      meta.department,
      meta.industry,
      meta.doc_type,
      meta.doc_date,
      meta.function,
      vectorString,
      libraryType // 归入对应的分类库字段
    );

    archiveFile(filePath, targetPath);
    console.log(`[处理完成]: ${filename} 归档成功。类型: ${fileType} | 归属分库: [${libraryType}]`);
  } catch (error: any) {
    console.error(`[处理失败]: 无法处理文件 ${filename}。原因: ${error.message}`);
  }
}

// 启动监测任务 (启用 chokidar 递归监测)
console.log(`[系统启动]: 正在启动公文文件夹监测服务...`);
const watcher = chokidar.watch(incomingDir, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 }
});

watcher.on("add", (filePath) => {
  processFile(filePath);
});

process.on("SIGINT", () => {
  watcher.close();
  db.close();
  process.exit();
});