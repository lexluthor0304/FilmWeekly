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
- `/admin`：内置单页后台，提供投稿审核、期刊创建与审计日志查看，需要 Bearer Token 才能调用 API。
- `/api/*`：RESTful 接口；管理员相关接口需通过 `Authorization: Bearer <TOKEN>` 访问。

Worker 内置队列消费者处理缩略图生成与内容审核任务；可根据自身服务修改 `MODERATION_API_URL` 与 `MODERATION_API_TOKEN`。
