# ImageHub 云端水印配置

此文档只说明上线前配置；本分支没有连接 Supabase、执行迁移、创建 bucket 或部署。

## 本地默认行为

`VITE_WATERMARK_CLOUD_ENABLED=false` 时，水印库继续只使用浏览器 IndexedDB。没有 URL 或匿名密钥时，页面也会明确显示“仅本机”，不会假装已同步。

## 上线前一次性操作

1. 在目标 Supabase 项目中启用 Email Magic Link。
2. 在目标项目的受控迁移流程中审核并执行 `supabase/migrations/20260711183000_watermark_assets.sql`。该 SQL 会建立 `watermark_assets`、启用 RLS、创建私有 `watermark-assets` bucket，并把 Storage 第一层目录限制为 `auth.uid()`。
3. 确认 `authenticated` 对 `public.watermark_assets` 的 Data API 权限已授予；RLS policy 仍将行限制为当前用户。
4. 将本地 `.env.example` 复制为本机私有环境文件，填入 URL、匿名/发布用客户端 key，并将开关改为 `true`。不要提交该私有文件，也不要使用 service-role key。
5. 在 GitHub Pages 的未来构建环境中配置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_WATERMARK_CLOUD_ENABLED`。本轮没有设置 GitHub Actions Secrets、Variables 或部署。

## 安全模型

- 浏览器只使用 Supabase 匿名/发布用客户端 key；绝不使用 service role。
- bucket 保持私有，前端通过已登录用户的 `download()` 取得 Blob，不保存永久公开 URL。
- 路径格式固定为 `<auth-user-id>/<watermark-id>/<safe-file-name>`。
- 水印只接受 PNG/JPEG/WebP，单个文件最多 2 MB，并以 SHA-256 按用户去重。
- 云端元数据写入失败时，前端会删除刚上传的对象；删除云端水印时，Storage 或数据库任一步失败都会报告失败，且不会删除本机缓存。

## 真实验收（本轮未执行）

需要一个非生产测试 Supabase 项目、已配置的 Magic Link redirect URL、两个浏览器 profile 和两个测试账号。验证同账号跨设备可见同一水印，且第二个账号无法列出、下载或删除第一个账号的 metadata 和 Storage 对象。
