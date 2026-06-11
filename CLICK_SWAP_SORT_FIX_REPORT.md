# ImageHub 多图合成点击互换排序修复报告

生成时间：2026-06-11

## 1. 修改文件

- `App.tsx`
- `components/CollageGrid.tsx`
- `components/PhotoCard.tsx`

备份目录：

`_fix_backups/click-swap-sort-before-20260611-003330`

## 2. 之前拖动排序在哪里

旧排序逻辑位于：

- `components/CollageGrid.tsx`
  - 使用 `@dnd-kit/core` 的 `DndContext`、`PointerSensor`、`KeyboardSensor`、`DragOverlay`
  - 使用 `@dnd-kit/sortable` 的 `SortableContext`
  - `handleDragEnd` 中交换 `active.id` 和 `over.id` 对应图片

- `components/PhotoCard.tsx`
  - 使用 `useSortable`
  - hover 遮罩显示“拖动排序”
  - 替换按钮位于遮罩中

## 3. 现在点击互换怎么实现

新交互位于 `components/CollageGrid.tsx`：

- 新增 `selectedSwapIndex: number | null`
- 点击第一张图时记录待交换索引
- 再点击另一张图时，只交换这两个索引的元素
- 其他图片数组位置保持不变
- 交换完成后清空选中状态
- 再次点击同一张图会取消选择
- 顶部浮层提示当前选择或交换结果
- 提供“取消选择”按钮

核心交换方式：

```ts
const nextItems = [...prev];
[nextItems[firstIndex], nextItems[secondIndex]] = [nextItems[secondIndex], nextItems[firstIndex]];
return nextItems;
```

## 4. 是否移除/隐藏拖动排序提示

已移除普通 UI 中的“拖动排序”提示。

顶部提示从：

`拖动方块交换位置`

改为：

`点击两张图片交换位置`

卡片 hover 文案改为：

- `点击选择交换位置`
- `已选中，点击另一张互换`
- `点击与第 N 张互换`

## 5. 替换图片如何避免触发交换

`components/PhotoCard.tsx` 中：

- 替换按钮使用 `event.preventDefault()`
- 替换按钮使用 `event.stopPropagation()`
- 替换按钮移动到右下角，避免用户点击卡片中心时误触发替换
- 文件选择完成后只替换当前 `id` 对应图片，不改变其他图片位置

## 6. 下载高清大图是否不受影响

不受影响。

下载逻辑仍在 `App.tsx` 中读取当前拼图 DOM。

Playwright smoke 已验证：

- 先点击互换图片
- 再触发“下载高清大图”
- 下载文件成功生成

## 7. 批量水印是否不受影响

不受影响。

本次只修改：

- 多图合成的 `CollageGrid`
- 多图合成的 `PhotoCard`
- 多图合成顶部提示文案

未修改批量水印读取、预览、拖动水印、导出核心逻辑。

Playwright smoke 已验证可切换到“批量水印”页面并正常显示。

## 8. tsc / build 结果

```bash
npx tsc --noEmit
```

结果：通过。

```bash
npm run build
```

结果：通过。

构建摘要：

- `1704 modules transformed`
- `dist/index.html`
- `dist/assets/index-eKOES4bY.js`

## 9. 页面测试结果

测试脚本：

`_fix_backups/click-swap-sort-e2e/run-smoke.cjs`

测试结果：通过。

覆盖场景：

- 点击第 1 张，再点击第 4 张，只交换第 1 和第 4 张
- 第 2、第 3、第 5、第 6 张保持原位置
- 点击第 2 张，再点击第 2 张，取消选择且顺序不变
- 点击“替换图片”不会进入待交换状态
- 替换图片只影响当前格
- 点击交换后下载高清大图成功
- 切换到批量水印页面正常

截图：

`_fix_backups/click-swap-sort-e2e/click-swap-sort.png`

## 10. 回滚方式

如需回滚本次改动，可从备份目录恢复：

```bash
cp -a _fix_backups/click-swap-sort-before-20260611-003330/App.tsx App.tsx
cp -a _fix_backups/click-swap-sort-before-20260611-003330/components/CollageGrid.tsx components/CollageGrid.tsx
cp -a _fix_backups/click-swap-sort-before-20260611-003330/components/PhotoCard.tsx components/PhotoCard.tsx
```

## 11. 敏感信息风险

未发现新增敏感信息风险。

本次未读取、输出或修改 Cookie、token、API key、密钥文件。

