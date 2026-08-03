import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto'; // 使用 Node.js 自带的加密模块生成 UUID，免去第三方依赖

const dbPath = path.join(process.cwd(), 'data', 'database.db');
console.log('开始执行统一知识资产库数据迁移:', dbPath);

const db = new Database(dbPath);

try {
  // 1. 确保新建 knowledge_assets 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_assets (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      knowledge_type TEXT NOT NULL CHECK(knowledge_type IN ('document', 'fact', 'policy', 'department_rule', 'case', 'template')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE SET NULL
    )
  `);
  console.log('1. knowledge_assets 表创建成功或已存在。');

  // 2. 迁移历史数据到统一知识资产库中
  const documents = db.prepare('SELECT * FROM documents').all() as any[];
  console.log(`2. 检测到现有 ${documents.length} 个原始文档。开始转换知识资产...`);

  const insertAsset = db.prepare(`
    INSERT INTO knowledge_assets (id, document_id, knowledge_type, title, content, metadata, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const doc of documents) {
    // 检查是否已经迁移过该文档关联的资产，避免重复迁移
    const exists = db.prepare('SELECT 1 FROM knowledge_assets WHERE document_id = ?').get(doc.id);
    if (exists) {
      continue;
    }

    // 获取该文档的所有段落内容，拼接成知识正文
    const paragraphs = db.prepare('SELECT content FROM paragraphs WHERE document_id = ? ORDER BY sequence ASC').all() as any[];
    const fullContent = paragraphs.map(p => p.content).join('\n\n');

    if (!fullContent.trim()) {
      continue; // 无实质内容则跳过
    }

    // 根据原有文件的特征/命名规则，合理映射 knowledge_type
    let knowledgeType = 'document'; // 默认是 document (普通参考语料)
    const docName = doc.name || '';
    
    if (docName.includes('统计') || docName.includes('数据') || docName.includes('指标')) {
      knowledgeType = 'fact'; // 统计数值数据库对应 fact
    } else if (docName.includes('职责') || docName.includes('定岗') || docName.includes('管理技术标准')) {
      knowledgeType = 'department_rule'; // 部门定岗职责表对应 department_rule
    } else if (docName.includes('规划') || docName.includes('政策') || docName.includes('准则') || docName.includes('条例')) {
      knowledgeType = 'policy'; // 政策对应 policy
    } else if (docName.includes('案例') || docName.includes('调研')) {
      knowledgeType = 'case'; // 案例对应 case
    } else if (docName.includes('模板') || docName.includes('样板')) {
      knowledgeType = 'template'; // 模板对应 template
    }

    const metadata = JSON.stringify({
      original_name: doc.name,
      file_size: doc.size,
      original_type: doc.type,
      department: doc.department || '未分配'
    });

    const assetId = crypto.randomUUID(); // 安全生成标准的 UUID v4
    insertAsset.run(
      assetId,
      doc.id,
      knowledgeType,
      doc.name,
      fullContent,
      metadata,
      doc.department || '系统导入',
      doc.created_at || new Date().toISOString()
    );
    count++;
  }

  console.log(`3. 迁移成功！共将 ${count} 个历史文档转换为统一知识资产库数据。`);
} catch (error) {
  console.error('迁移过程中发生错误:', error);
} finally {
  db.close();
  console.log('数据库连接已安全关闭。');
}