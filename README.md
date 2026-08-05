# 公文智能辅助写作

基于历史参考材料进行检索、提纲确认、分章节起草、合规审查和 DOCX 导出的 Next.js 应用。

## Cloudflare 架构

- **Cloudflare Workers + OpenNext**：运行 Next.js 页面与 Route Handlers。
- **D1 (`APP_DB`)**：保存材料正文、元数据、知识资产与生成历史。
- **R2 (`DOCUMENTS_BUCKET`)**：保存上传的 DOCX 原文件；D1 只保存对象键和可检索正文。
- **R2 (`NEXT_INC_CACHE_R2_BUCKET`)**：保存 OpenNext 增量缓存。

`wrangler.jsonc` 中的 D1 数据库 ID 是一个安全占位符，不能直接部署。请先创建资源并替换它。

## 首次部署

```powershell
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler d1 create government-project-vision
npx.cmd wrangler r2 bucket create government-project-vision-documents
npx.cmd wrangler r2 bucket create government-project-vision-cache
```

将 `wrangler d1 create` 返回的 `database_id` 填入 `wrangler.jsonc` 的 `database_id`，再执行：

```powershell
npm.cmd run cf:d1:migrate:remote
npx.cmd wrangler secret put DEEPSEEK_API_KEY
npx.cmd wrangler secret put ZHIPU_API_KEY
npx.cmd wrangler secret put ACCESS_PASSWORD
npm.cmd run cf:deploy
```

不要把 API 密钥或 `.dev.vars` 提交到 Git。

## 验证与本地开发

```powershell
npm.cmd run build       # Next.js 生产构建
npm.cmd run cf:build    # 生成 Cloudflare Worker 产物
npm.cmd run cf:dev      # 使用本地 D1/R2 模拟运行 Worker
```

本地开发也可继续运行 `npm.cmd run dev`。首次使用 Cloudflare 绑定时，先创建 `.dev.vars` 并填入 API 密钥；数据库和对象存储由 Wrangler 在本地模拟。
