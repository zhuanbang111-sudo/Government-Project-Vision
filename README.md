# 公文智能辅助写作

基于历史参考材料进行检索、提纲确认、分章节起草、合规审查和 DOCX 导出的 Next.js 应用。

## Cloudflare 架构

- **Cloudflare Workers + OpenNext**：运行 Next.js 页面与 Route Handlers。
- **D1 (`APP_DB`)**：保存用户、角色、项目、文件元数据、文稿版本、引用关系与审计记录。
- **R2 (`DOCUMENTS_BUCKET`)**：保存上传的 DOCX 原文件和项目最终导出文件；D1 保存对象键与可检索正文。
- **R2 (`NEXT_INC_CACHE_R2_BUCKET`)**：保存 OpenNext 增量缓存。

当前仓库已绑定正式 D1 与 R2 资源；复制项目到其他 Cloudflare 账号时，需要替换对应资源 ID 和存储桶名称。

## 身份与项目档案

- 默认采用单人测试兼容模式，不显示额外登录页。
- 接入 Cloudflare Access 后，系统读取已验证邮箱，自动记录操作者并执行工作区权限校验。
- 如需禁止未验证访问，将 Worker 变量 `ACCESS_AUTH_MODE` 设置为 `required`，并先在 Cloudflare Zero Trust 中为站点配置 Access 策略。
- 每次写作会自动形成项目档案，依次保存任务、提纲、资料片段、AI 初稿、审核稿、最终稿和 DOCX 导出记录。
- 文件和项目的“删除”默认是可恢复归档；R2 原文件不会被立即物理删除。

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
npm.cmd run cf:deploy
```

不要把 API 密钥或 `.dev.vars` 提交到 Git。

### Cloudflare Workers Builds（连接 GitHub）

在 Cloudflare 控制台的 **Workers & Pages → 当前 Worker → Settings → Builds** 中设置：

```text
Build command:  npm ci && npm run cf:build
Deploy command: npx wrangler deploy
```

`cf:build` 会生成 `.open-next/worker.js` 和 `.open-next/assets`；部署阶段再由 Wrangler 上传这些产物。不要将 Build command 留空后只运行 `npx wrangler deploy`，因为仓库中不会提交构建产物。

## 验证与本地开发

```powershell
npm.cmd run build       # Next.js 生产构建
npm.cmd run cf:build    # 生成 Cloudflare Worker 产物
npm.cmd run cf:dev      # 使用本地 D1/R2 模拟运行 Worker
```

本地开发也可继续运行 `npm.cmd run dev`。首次使用 Cloudflare 绑定时，先创建 `.dev.vars` 并填入 API 密钥；数据库和对象存储由 Wrangler 在本地模拟。
