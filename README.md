# FilmWeekly

FilmWeekly 是一个基于 Cloudflare Workers 的胶片摄影期刊投稿与发布平台原型。该项目实现了投稿、期刊、审核等核心后端接口以及 D1 数据结构，便于快速部署到 Cloudflare 边缘环境。

## 功能概述

- **投稿管理**：支持作者信息、作品说明、多图上传（通过 R2 存储）与自动生成缩略图任务队列。
- **期刊管理**：按期数维护导向语句与主题摘要，可设定发布时间状态流程（草稿/预定/已发布）。
- **审核流程**：管理员可对投稿执行审批、驳回或修改请求，并记录审计日志。
- **检索导出**：提供按状态、期刊、作者、地点等查询的后台接口，便于批量筛选与导出。
- **Cloudflare 集成**：整合 D1、R2、KV 与 Queues，满足高分辨率图片上传与异步处理需求。

## 目录结构

```
├── package.json
├── schema.sql           # D1 数据库结构定义
├── src
│   ├── lib              # 校验与数据库访问逻辑
│   ├── routes           # Hono 路由
│   ├── types            # Worker 运行时类型
│   └── worker.ts        # 入口文件
└── wrangler.toml        # Cloudflare Workers 配置
```

## 快速开始

1. 安装依赖：

   ```bash
   npm install
   ```

2. 初始化本地 D1 数据库并导入结构：

   ```bash
   npx wrangler d1 execute filmweekly --local --file=./schema.sql
   ```

3. 本地开发调试：

   ```bash
   npm run dev
   ```

   通过 `http://localhost:8787` 访问；RESTful 接口位于 `/api/*`。

## 核心接口

- `POST /api/submissions`：创建投稿；接收作品信息与图片元数据。
- `GET /api/submissions`：按条件筛选投稿列表。
- `GET /api/submissions/:id`：查看投稿详情及图片顺序、导向语。
- `POST /api/submissions/:id/review`：提交审核结果并记录日志。
- `POST /api/issues`：创建新的期刊期数与导向语。
- `GET /api/issues`：查看期刊列表。
- `POST /api/issues/:id/publish`：更新期刊状态（草稿/预定/发布）。

## 前后端概览

- `/`：列出所有已发布期刊，支持查看期刊详情与作品画廊展示。
- `/admin`：内置单页后台，提供投稿审核、期刊创建与审计日志查看，支持邮箱验证码免密登录。
- `/api/*`：RESTful 接口；管理员相关接口需携带会话 Cookie（或备用 Bearer Token）访问。

### 管理后台登录接口

- `POST /api/otp/request`：提交邮箱后生成 6 位验证码（单次有效、默认 5 分钟）并发送邮件。
- `POST /api/otp/verify`：验证邮箱 + 验证码，成功后发放 HttpOnly 会话 Cookie。
- `POST /api/otp/logout`：注销当前会话并清理 Cookie。
- `GET /api/otp/session`：检查当前 Cookie 对应的会话状态。

部署前需通过 `wrangler secret put` 设置以下敏感配置：

- `OTP_PEPPER`：验证码哈希 Pepper。
- `SESSION_HS256_SECRET`：会话 Token HMAC 密钥。
- 邮件服务 API Key（示例使用 Resend 的 `RESEND_API_KEY` 与 `EMAIL_FROM_ADDRESS`）。

此外，需要在 `admin_users` 表中预置允许登录的管理员邮箱（例如通过 D1 控制台或迁移脚本插入记录）。

Worker 内置队列消费者处理缩略图生成与内容审核任务；可根据自身服务修改 `MODERATION_API_URL` 与 `MODERATION_API_TOKEN`。
