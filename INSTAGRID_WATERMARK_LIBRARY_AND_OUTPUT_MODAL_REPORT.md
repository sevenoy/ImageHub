# InstaGrid 常用水印库与输出提示优化报告

生成时间：2026-06-10 21:13:44 +07

## 1. 备份目录路径

修改前已完整备份当前好用版本：

`/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main-good-before-watermark-library-20260610-205332`

已验证备份目录存在，且包含：

- `package.json`
- `components`
- `utils`
- 非空项目文件

回滚方式：停止当前 5206 服务后，用上述备份目录覆盖原项目目录 `InstaGrid-main`。

## 2. 修改文件列表

应用源码改动：

- `App.tsx`
- `components/BatchWatermarkPanel.tsx`
- `utils/watermarkLibrary.ts`

新增报告：

- `INSTAGRID_WATERMARK_LIBRARY_AND_OUTPUT_MODAL_REPORT.md`

验证辅助文件：

- `_fix_backups/watermark-library-e2e/run-smoke.cjs`
- `_fix_backups/watermark-library-e2e/assets/base.png`
- `_fix_backups/watermark-library-e2e/assets/mark.png`
- `_fix_backups/watermark-library-e2e/watermark-library-output-modal.png`

验证辅助文件只用于本地 smoke test，不参与应用运行，也不会保存用户水印数据。

## 3. 隐藏“文件夹读取”入口的方式

只在顶部导航中隐藏了“文件夹读取”按钮。

保留内容：

- `LocalFolderReadTestPanel` 源码未删除
- `folder-test` 内部分支未删除
- 文件夹读取相关工具未修改

影响范围：

- 普通顶部导航只显示“多图合成”和“批量水印”
- 不影响“多图合成”
- 不影响“批量水印”
- 不修改文件夹读取核心逻辑

## 4. 常用水印库如何保存

新增 `utils/watermarkLibrary.ts`，使用浏览器 IndexedDB 本地保存常用图片水印。

数据库：

- DB：`instagrid-watermark-library`
- Store：`watermarks`

保存字段：

- `id`
- `name`
- `mimeType`
- `dataUrl`
- `createdAt`
- `size`

保存流程：

1. 用户在“图片水印”模式上传水印图。
2. 点击“保存到常用水印”。
3. 输入名称，默认可使用原文件名。
4. 前端将当前水印文件转为 `dataUrl`。
5. 写入当前浏览器的 IndexedDB。

如果用户在命名弹窗中点击取消，不会保存。

## 5. 常用水印库是否持久化

是。常用水印保存到当前浏览器 IndexedDB。

已通过 headless browser smoke test 验证：

- 上传水印图
- 保存到常用水印
- 刷新页面
- 常用水印仍然存在
- 点击“使用”后可应用到当前图片水印

限制：

- 数据只在当前浏览器、当前站点本地保存。
- 不同步到其他浏览器或设备。
- 清理浏览器站点数据后会被删除。

## 6. 输出完成弹窗如何实现

批量处理完成后新增 `outputSummary` 状态并显示完成弹窗。

弹窗包含：

- 标题：`批量水印完成`
- 成功数量
- 失败数量
- 跳过数量
- 输出方式
- 输出文件夹名
- 输出位置
- 失败时可点击“查看失败原因”
- “复制输出路径”
- “关闭”

计数方式：

- 批量处理循环内使用局部计数器统计成功和失败。
- 单张失败会记录具体错误原因。
- 失败不会阻止完成弹窗显示，除非任务整体被取消或发生顶层异常。

## 7. 是否支持直接打开输出文件夹

当前不支持直接打开 Finder 输出文件夹。

原因：

- 当前项目是普通浏览器网页，没有 Node/native bridge。
- 浏览器安全模型不允许网页任意打开本机 Finder 目录。
- File System Access API 可写入用户选择的目录，但不能通用地打开 Finder。

已实现替代能力：

- 显示输出位置或浏览器下载目录提示。
- 提供“复制输出路径”按钮。
- ZIP fallback 时提示结果在浏览器下载目录。

## 8. tsc 结果

命令：

```bash
npx tsc --noEmit
```

结果：通过。

## 9. build 结果

命令：

```bash
npm run build
```

结果：通过。

构建输出摘要：

- Vite 构建成功
- 1709 modules transformed
- 生成 `dist/index.html`
- 生成 `dist/assets/index-B13RKGIJ.js`

## 10. 页面验证结果

访问地址：

`http://127.0.0.1:5206/`

验证命令：

```bash
curl -I http://127.0.0.1:5206/
```

结果：`HTTP/1.1 200 OK`

浏览器 smoke test：

```bash
node _fix_backups/watermark-library-e2e/run-smoke.cjs
```

结果：通过。

已验证：

- 顶部不再显示“文件夹读取”入口。
- “多图合成”仍显示。
- “批量水印”仍显示。
- 可进入批量水印。
- 可切换到“图片水印”。
- 可上传水印图。
- 可保存到常用水印。
- 刷新页面后常用水印仍存在。
- 可从常用水印库点击“使用”应用水印。
- 可上传底图。
- 可开始批量水印。
- 有 ZIP 下载结果。
- 完成后显示“批量水印完成”弹窗。
- 弹窗显示输出位置。
- “复制输出路径”可用，并切换为“已复制”。
- 未发现 console/page crash error。

截图：

`/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main/_fix_backups/watermark-library-e2e/watermark-library-output-modal.png`

## 11. 是否发现敏感信息风险

未发现新增敏感信息风险。

已检查：

- 未发现 `.env`、`.env.*`
- 未发现 cookie/token/secret/credential/private key 文件
- 未读取或输出 Cookie、token、密钥值
- 常用水印图片只保存到浏览器 IndexedDB
- 未将用户水印图片写入源码目录
- 未修改 `node_modules`

关键词扫描命中文件为既有文档/配置中的变量名或说明类文本，没有输出任何敏感值。

## 12. LocalHub 与端口影响

未修改 LocalHub 配置。

端口状态：

- 5206：InstaGrid-main 正常监听
- 5207：未停止、未修改
- 5208：未占用、未使用

访问地址保持：

`http://127.0.0.1:5206/`

## 13. 回滚方式

如需回滚到修改前的好用版本：

1. 停止当前 `InstaGrid-main` 的 5206 服务。
2. 将当前目录重命名或移走。
3. 用备份目录恢复：

```bash
cp -a "/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main-good-before-watermark-library-20260610-205332" "/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main"
```

注意：执行回滚前应先确认目标目录处理方式，避免覆盖新数据。

