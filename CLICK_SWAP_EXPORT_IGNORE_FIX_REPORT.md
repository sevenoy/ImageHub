# 点击交换提示误入下载图修复报告

## 本次使用的 skills

- skill-router：按任务选择项目管理、小改、前端验证、可靠性验证、安全扫描、handoff 流程。
- local-project-manager：确认项目路径与 5206 服务状态。
- legacy-code-safe-change：只修改多图合成导出相关文件，保留现有交互和批量水印逻辑。
- frontend-ui-review：检查交换提示、待交换角标、替换按钮浮层是否属于界面 UI，不应进入导出图。
- production-reliability-review：执行 TypeScript、build、curl、headless 下载验证。
- security-secret-scan：只做文件名级敏感词扫描，不输出任何密钥值。
- playwright-e2e-check：使用 1 个 headless Chromium 验证页面交换、下载和回归流程。
- handoff：生成本报告作为后续追踪依据。

## 问题原因

多图合成下载使用 `html-to-image` 捕获 `collageRef` 内的 DOM。点击交换后的成功提示“已交换第 N 张和第 M 张”位于 `collageRef` 内部，因此下载时也被渲染进最终图片。

同类风险还包括：

- “待交换”角标在卡片内部。
- hover 操作浮层和“替换图片”按钮在卡片内部。
- 选中状态 ring 样式位于图片卡片根节点。

## 修改文件

- `App.tsx`
  - 新增 `shouldIncludeInExport` 过滤函数。
  - 下载时给 `html-to-image` 传入 `filter`，跳过 `data-export-ignore="true"` 的节点。
  - 新增 `isExportMode`，下载开始时开启，结束后关闭。
  - 将 `isExportMode` 传给 `CollageGrid`。

- `components/CollageGrid.tsx`
  - 接收 `isExportMode`。
  - 导出模式下不渲染交换提示浮层。
  - 给交换提示浮层添加 `data-export-ignore="true"`。
  - 将 `isExportMode` 传给 `PhotoCard`。

- `components/PhotoCard.tsx`
  - 接收 `isExportMode`。
  - 导出模式下不渲染“待交换”角标和 hover 操作浮层。
  - 导出模式下不应用选中 ring 样式。
  - 给 UI 浮层添加 `data-export-ignore="true"`。
  - 替换图片逻辑未改。

## 验证结果

- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `curl -I http://127.0.0.1:5206/`：HTTP 200。
- 专项 Playwright 验证：通过。
  - 页面上先确认“已交换第 3 张和第 2 张”提示可见。
  - 立即下载高清图。
  - 保存文件：`_fix_backups/export-ignore-swap-ui-e2e/export-with-swap-notice.png`
  - 抽样下载 PNG 顶部区域像素为测试图片红色 `rgb(185, 28, 28)`，不是白色提示条。
- 回归 Playwright 验证：通过。
  - 点击两张图片互换位置。
  - 再次点击同一张取消选择。
  - 替换图片不触发交换。
  - 下载高清大图可用。
  - 批量水印页面入口正常。

## 影响范围

- 未修改批量水印、文件夹读取、水印预览逻辑。
- 未修改 LocalHub 配置。
- 未修改端口，仍使用 `5206`。
- 未影响 5207、5208。
- 未执行 git add / commit / push。

## 备份与回滚

修改前备份目录：

`_fix_backups/export-ignore-swap-ui-20260611-005932`

如需回滚，可从该目录恢复：

- `App.tsx`
- `components/CollageGrid.tsx`
- `components/PhotoCard.tsx`

## 敏感信息风险

执行了文件名级敏感词扫描，未输出任何 secret/token/cookie/key 值。本次改动没有新增密钥、没有读取 Cookie、没有上传用户文件。
