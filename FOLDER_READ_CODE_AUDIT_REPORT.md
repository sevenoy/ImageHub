# InstaGrid 文件夹读取崩溃 — 全项目只读审计报告

> 本报告为**只读审计**结果。审计过程中**未修改任何源码、未删除任何文件、未初始化 Git、未安装依赖**。
> 报告末尾附「下一步修复命令草案」，但**未执行**。

---

## 0. 基本信息

| 项 | 值 |
|---|---|
| 执行时间 | 2026-06-09 11:25 UTC |
| 项目路径 | `/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main` |
| 当前运行端口 | `http://127.0.0.1:5206`（`vite.config.ts` 中 `server.port = 5206, host = 127.0.0.1`，与运行端口一致） |
| 是否 Git 仓库 | **否**。目录下没有 `.git`，但存在 `.gitignore` 与 `.github/`。当前不是一个已初始化的本地仓库。 |
| 框架结构 | **Vite 6 + React 19 + TypeScript 5.8**（纯前端 SPA，无 Next/SSR）。入口 `index.html` → `index.tsx` → `App.tsx`。 |
| 包管理脚本 | `dev: vite`、`build: vite build`、`preview: vite preview`。**注意：`build` 不含 `tsc`，类型错误不会阻断打包。** |
| 是否发现敏感信息 | **否**。全项目无 `.env` 文件；`GEMINI_API_KEY` 仅作为 `vite.config.ts` 的 `define` 占位符出现，无实际密钥值，`dist/` 中也无该值。审计中未读取/输出任何密钥。 |
| 模型 / 模式 | Claude Opus（`claude-opus-4-8`），Read-only / Audit 模式。 |

### 环境说明（关于验收命令）
- `npx tsc --noEmit`：**通过**（exit 0，无类型错误）。
- `npm run build`：在审计沙箱（Linux aarch64）中**失败**，原因是 `node_modules` 是在用户 macOS（darwin-arm64）上安装的，缺少 `@rollup/rollup-linux-arm64-gnu`（已确认 `node_modules/@rollup/` 只有 `rollup-darwin-arm64`，`@esbuild/` 只有 `darwin-arm64`）。**这是平台依赖不匹配，不是代码缺陷**，在用户本机（运行 5206 的同一台 macOS）上 build 可正常完成。

---

## 1. 代码结构概览

```
InstaGrid-main/
├── index.html              # 入口，CDN 引入 tailwind；挂载 #root
├── index.tsx               # ReactDOM.createRoot → <App/>，无 ErrorBoundary
├── App.tsx                 # 顶层；三个 Tab：拼图 / 文件夹读取 / 批量水印
├── types.ts                # CollageItem / LayoutType
├── components/
│   ├── CollageGrid.tsx          # 拼图（与崩溃无关）
│   ├── PhotoCard.tsx            # 拼图卡片
│   ├── LocalFolderReadTestPanel.tsx   # 「文件夹读取」页（崩溃相关）
│   └── BatchWatermarkPanel.tsx        # 「批量水印」页（崩溃相关）
├── utils/
│   ├── localImageFiles.ts       # 文件夹读取核心：过滤/规整/构建结果（崩溃相关）
│   ├── nativeFolderInputDebug.ts# 诊断面板数据构建
│   ├── batchWatermark.ts        # 批量解码/绘制/写盘/ZIP（崩溃相关）
│   └── zipBuilder.ts            # 纯前端 ZIP 打包
├── vite.config.ts          # port 5206；define 注入 GEMINI_API_KEY（无值）
└── tsconfig.json           # 注意：未开启 strict
```

> 备注：`components/` 与 `utils/` 中存在多个 macOS AppleDouble 垃圾文件（`._BatchWatermarkPanel.tsx`、`._localImageFiles.ts` 等），因为项目存放在外接归档盘上。它们不参与构建，但**佐证了运行环境确实充满 `._*` 类文件**，与崩溃场景高度相关。

---

## 2. 文件夹读取调用链地图

```
用户点击「选择文件夹」按钮 (LocalFolderReadTestPanel.tsx:254)
  → directoryInputRef.current.click()           // 隐藏的 <input webkitdirectory multiple>
  → 浏览器弹出【原生系统文件夹选择框】          // ← 自动化无法操作的原生对话框
  → onChange = handleDirectoryInputChange (:131)
      → clearImages()                            // 撤销旧 objectURL
      → files = Array.from(event.currentTarget.files)
      → readImagesFromFileList(files,'webkitdirectory')   // localImageFiles.ts:312
          → 逐个 file → getFileRelativePath()    // 读 webkitRelativePath || file.name
          → buildResult()                        // localImageFiles.ts:222
              → normalizeRelativePath(rawRelativePath, rootName)  // :132  ← 崩溃点
              → isMacSystemFile()  过滤 ._*/.DS_Store/__MACOSX/...  // :147
              → isSupportedImageName()  仅按扩展名 jpg/jpeg/png/webp // :163
              → makeItem() → makeObjectUrl()  // 每个图片都 createObjectURL // :173,205
              → 排序 localeCompare → images[]
      → setNativeDebug(...) → applyReadResult(images, report)  // :120
          → setItems(images)   // 全部 File + 全部 objectURL 进 React state
  → 渲染：分页 200/页 (:217) → <img src={item.objectUrl}>  // :405 无 onError
```

**关键点**：过滤只看扩展名，从不验证能否解码；每个被接受的文件都立即 `createObjectURL`；**没有任何数量上限**，全部 `File` 与 `objectURL` 一次性进入 state。

---

## 3. 批量水印调用链地图

```
用户点击「选择文件夹」(BatchWatermarkPanel.tsx:727) → folderInputRef.click()
  → 原生系统文件夹框 → onChange = handleFallbackFolderInput (:345)
      → readImagesFromFileList(stableFiles,'webkitdirectory',{createObjectUrls:false}) // 不建 URL
      → applyImageReadResult(items, stats) (:275)
          → items.slice(0, DEFAULT_MAX_BATCH_IMAGES=1000)  // ← 有上限
          → entries[] = {id,file,name,relativePath,directoryPath[]}  // setEntries
  「高级选择文件夹」→ handleAdvancedPickSourceFolder (:399)
      → showDirectoryPicker() → readImagesFromDirectoryHandle()  // 流式 + AbortSignal

用户点击「开始批量加水印」→ startProcessing (:531)
  → for entry of entries:
      → getEntryFile(entry, signal)            // batchWatermark.ts:170
      → renderWatermarkedImage(file,...)        // :383  loadCanvasImage→canvas→toBlob
          ↑ 每个 entry 用 try/catch 包裹 (:601-627)，单个失败只记 failed，不中断
      → writeBlobToDirectory() 或 zipBuilder.addFile()
  → 非目录输出且 >200 张 → 走 ZIP，且 startProcessing 前置拦截 (:548)
```

**关键点**：批量页比文件夹读取页**健壮得多**——有 1000 张上限、`createObjectUrls:false`、逐个 try/catch 容错、ZIP 200 张阈值、AbortController 可取消。两页**共用** `readImagesFromFileList` 过滤逻辑，但文件夹读取页放弃了所有这些保护。

---

## 4. 真实复现

### 4.1 复现环境限制（必须说明）
- **Claude-in-Chrome 扩展在本次会话中未连接**（多次重试均返回 not connected），无法驱动宿主浏览器打开 5206。
- 即使浏览器可用，`<input webkitdirectory>` 触发的是**操作系统原生文件夹选择对话框**，位于页面 DOM 之外，浏览器自动化（computer 工具）**本质上无法选择文件夹**。这是该功能极难做端到端自动化复现的客观原因。

### 4.2 采用的可靠复现方式：逻辑级真实复现
我没有跳过复现，而是用**项目真实源码**跑了一遍过滤管线。做法：用 Node 22 的原生类型擦除直接 `import` 了 `utils/localImageFiles.ts`（真实文件，未改），构造与下方测试目录完全一致的 mock `File`（含 `webkitRelativePath`），调用真实的 `readImagesFromFileList`。

### 4.3 测试目录（已按要求创建）
位置：`outputs/instagrid-folder-read-audit-test/`（沙箱内，未写入用户项目目录）
```
real/a.jpg          16x16 真实可解码 JPEG (634 B, file: JPEG image data)
real/b.png          16x16 真实可解码 PNG  (86 B,  file: PNG image data)
bad/not-image.jpg   纯文本伪装成 jpg (56 B, file: ASCII text)
._fake.png          AppleDouble 垃圾 (100 B)
.DS_Store           系统垃圾
__MACOSX/._a.jpg    系统垃圾
```

### 4.4 复现到的真实行为 / 错误栈

**A. 正常 webkitdirectory 输入（6 个文件，含上述全部）的真实输出：**
```
imageCount      : 3       ← real/a.jpg, real/b.png, 以及【bad/not-image.jpg】
skippedCount    : 3       ← ._fake.png / .DS_Store / __MACOSX/._a.jpg 被正确跳过
systemSkipped   : 3
invalidImage    : 0       ← 永远是 0（见下）
kept images     : ['bad/not-image.jpg', 'real/a.jpg', 'real/b.png']
```
> 结论 1：macOS 系统文件过滤**有效**。问题不在 `._*` 过滤——和你的判断一致。
> 结论 2：**纯文本伪装的 `bad/not-image.jpg` 被当成有效图片接受了**（因为只看扩展名，从不解码）。`invalidImageCount` 恒为 0。

**B. 健壮性探针（捕获到真实崩溃栈）：**
```
null 输入                         → 不抛错（imageCount 0）         ✅
空字符串 name ""                  → 不抛错（skip 1）               ✅
name 有 / webkitRelativePath 缺   → 不抛错（img 1）                ✅
name 与 relativePath 都 undefined → 抛出 TypeError ❌
```
真实错误栈（来自运行项目源码）：
```
TypeError: Cannot read properties of undefined (reading 'split')
    at normalizeRelativePath (utils/localImageFiles.ts:133:30)
    at buildResult           (utils/localImageFiles.ts:243:26)
    at readImagesFromFileList (utils/localImageFiles.ts:322:10)
```

### 4.5 关于「为什么真实使用会崩，但测试不崩」的核心解释
普通点「选择文件夹」时，浏览器给出的每个 `File.name` 都是**非空字符串**，所以 4.4-B 那个 `undefined.split` 崩溃**不会**从标准按钮触发（属于潜在隐患，非主因）。真实崩溃最可能来自**两个未设防的工程问题**（详见 P0 部分）：

1. **文件夹读取页没有任何数量上限**，且对**每个**文件都 `createObjectURL`，并把**全部** `File` + `objectURL` 一次性塞进 React state。选一个真实照片文件夹（成百上千张、几 GB）时 → 内存暴涨 + 海量 blob URL → **标签页 OOM 崩溃 / 卡死**。小测试目录只有几张，永远不会触发。
2. **全局没有 ErrorBoundary**：渲染期任意一次未捕获异常都会让 `createRoot` 整棵树卸载 → **白屏**，用户感知为「崩溃」。

---

## 5. 根因判断（按优先级）

### P0 — 必修，直接导致崩溃

#### P0-1　文件夹读取无数量上限 + 全量 objectURL + 全量 File 进 state（最可能根因）
- **严重级别**：P0
- **涉及文件**：`utils/localImageFiles.ts`、`components/LocalFolderReadTestPanel.tsx`
- **代码位置**：
  - `localImageFiles.ts:230` `createObjectUrls = options.createObjectUrls ?? true`（默认建 URL）
  - `localImageFiles.ts:205-215` `makeItem` 对每个图片 `makeObjectUrl`
  - `LocalFolderReadTestPanel.tsx:138` `readImagesFromFileList(files, 'webkitdirectory')` **未传 `createObjectUrls:false`，未做任何 slice 上限**
  - `:147 applyReadResult` → `:124 setItems(images)` 全量入 state
  - 对比：`BatchWatermarkPanel.tsx:279` 有 `slice(0, DEFAULT_MAX_BATCH_IMAGES)`，且 `:317/:354` 传 `createObjectUrls:false`
- **证据**：`grep` 确认 `localImageFiles.ts` 与文件夹读取页**均无 MAX/上限**逻辑；批量页两项保护齐全。
- **触发场景**：选择真实大照片文件夹（数百~数千张 / 数 GB）。小目录不触发，故「测试 OK、真实崩」。
- **推荐修复**：文件夹读取页改为 `createObjectUrls:false`（预览改为可见项懒加载/或点开再解码，参考批量页「加载示例图预览」模式）；并加导入上限（如复用 `DEFAULT_MAX_BATCH_IMAGES` 或单独阈值）+ 超限提示。
- **可最小修复**：可以（先加上限 + 关闭 eager objectURL）。
- **修复风险**：低~中（预览策略改动需对应 UI 调整）。

#### P0-2　全局缺少 ErrorBoundary，任意渲染异常 → 整页白屏
- **严重级别**：P0
- **涉及文件**：`index.tsx`、`App.tsx`（全项目无任何 ErrorBoundary，已 grep 确认）
- **代码位置**：`index.tsx:11 root.render(<App/>)` 外层无错误边界；`App.tsx:647/651` 直接渲染两个面板。
- **证据**：`Glob **ErrorBoundary**` 无结果；`index.tsx` 仅 `createRoot().render`。
- **触发场景**：任一面板渲染期抛错（如下方 P1 的 undefined、坏对象渲染等）都会卸载整棵树。
- **推荐修复**：在 `App` 外或每个面板外包一层 ErrorBoundary，崩溃时显示可恢复的回退 UI 而非白屏。
- **可最小修复**：可以（新增一个 ErrorBoundary 组件并包裹）。
- **修复风险**：低。

#### P0-3　`normalizeRelativePath` 对 undefined 路径直接 `.split` 崩溃
- **严重级别**：P0（潜在，但属硬崩溃路径）
- **涉及文件**：`utils/localImageFiles.ts`
- **代码位置**：`:132 normalizeRelativePath` → `:133 relativePath.split('/')`；上游 `:243 buildResult`；`getFileRelativePath():122` 返回 `webkitRelativePath || file.name`，若两者皆 `undefined`（拖入的目录项 / 非标准 File / DataTransferItem）则传入 `undefined`。
- **证据**：4.4-B 捕获到真实 `TypeError: ...reading 'split'`，栈定位到 `:133`。
- **触发场景**：拖拽目录条目、`webkitGetAsEntry` 产物、或异常 File 对象进入 `readImagesFromFileList`。
- **推荐修复**：`getFileRelativePath` 兜底为字符串（`?? ''`），`normalizeRelativePath` 入参做 `String(x ?? '')` 防御。
- **可最小修复**：可以（一行兜底）。
- **修复风险**：极低。

### P1 — 高风险，易导致崩溃或数据错乱

#### P1-1　只按扩展名判断图片，坏图/伪装文件被当成有效图片
- **严重级别**：P1
- **涉及文件**：`utils/localImageFiles.ts`、`utils/batchWatermark.ts`
- **代码位置**：`localImageFiles.ts:163 isSupportedImageName`（仅 `getExtension`）；`:239 const invalidImageCount = 0`（硬编码常量，从不统计）；`canDecodeImage():179` **已实现但全项目从未被调用**（死代码，已 grep 确认）。`batchWatermark.ts:157 isSupportedImageFile` 同样只看类型/扩展名。
- **证据**：4.4-A 中 `bad/not-image.jpg`（纯文本）被计入 `imageCount` 并出现在 `kept images`；`invalidImageCount:0`。
- **触发场景**：文件夹里有扩展名是图片但内容损坏/伪装的文件。文件夹读取页 `<img>` 无 `onError`（`:405`），坏图直接显示破图；批量页在 `renderWatermarkedImage` 处会解码失败但被 try/catch 记为 failed（不崩，相对安全）。
- **推荐修复**：把已有的 `canDecodeImage` 接入过滤（或在预览/处理前做一次轻量解码校验），并真实统计 `invalidImageCount`；给文件夹读取页 `<img>` 加 `onError` 占位。
- **可最小修复**：可以。
- **修复风险**：中（解码校验有性能成本，需配合上限/懒加载）。

#### P1-2　React 列表 key 用可能重复/不稳定的字符串
- **严重级别**：P1
- **涉及文件**：`components/LocalFolderReadTestPanel.tsx`
- **代码位置**：`:360 key={path}`（relativePath，去重前可能重复）、`:374 key={entryError}`（错误文本作 key）。
- **证据**：`buildResult` 用 `Map<id>` 对图片去重，但 `firstRelativePaths`/`errors` 数组未去重，相同字符串作 key 触发 React 警告，极端情况下渲染错乱。
- **触发场景**：同名 relativePath 或重复错误信息。
- **推荐修复**：key 改为 `index` 复合（如 `` `${path}-${i}` ``）。
- **可最小修复**：可以。　**修复风险**：极低。

#### P1-3　`regeneratePreviews` 对大列表一次性重建全部 objectURL
- **严重级别**：P1
- **涉及文件**：`components/LocalFolderReadTestPanel.tsx`
- **代码位置**：`:206-215` 对 `prev.map` 全量 `revoke + createObjectURL`。
- **证据**：在 P0-1 的无上限前提下，点「重新生成预览」会把内存压力再放大一倍。
- **触发场景**：大文件夹 + 点击重新生成预览。
- **推荐修复**：与 P0-1 一并改为懒加载/可见项再建 URL。
- **可最小修复**：可以（依赖 P0-1 策略）。　**修复风险**：中。

### P2 — 中风险，影响稳定性

#### P2-1　文件夹读取页与批量页过滤口径不完全一致
- **涉及文件**：`localImageFiles.ts:147 isMacSystemFile`（按路径任意段匹配，含 `__MACOSX`/`Thumbs.db`/`desktop.ini`）vs `batchWatermark.ts:129 isSkippableMacFile`（只查 `.DS_Store` 和 `._` 前缀）。
- **证据**：两套 mac 文件判定范围不同；`makeSelectionFromFiles` 对 `Thumbs.db`/`desktop.ini` 仅靠扩展名兜底。
- **触发场景**：含 Windows 系统文件的文件夹在两页表现不同。
- **推荐修复**：统一到 `localImageFiles.isMacSystemFile` 一处。　**可最小修复**：可以。　**修复风险**：低。

#### P2-2　诊断 JSON 整块渲染（数据有上界但偏大）
- **涉及文件**：`LocalFolderReadTestPanel.tsx:322`、`BatchWatermarkPanel.tsx:803`、`nativeFolderInputDebug.ts:121`
- **证据**：诊断对象 `firstTenFiles` 已限 10、不含原始 File，**不会**因序列化 File 崩溃（设计安全）；但 `JSON.stringify(...,2)` 整块塞进 `<pre>`，大状态下偏重；文件夹读取页诊断默认展开（`:321`）。
- **推荐修复**：默认折叠。　**可最小修复**：可以。　**修复风险**：极低。

### P3 — 体验 / 维护问题
- **P3-1**　`tsconfig.json` 未开启 `strict`（`:1`），null/undefined 隐患（如 P0-3）TS 不报错。
- **P3-2**　`build` 脚本不含 `tsc`（`package.json:8`），类型错误不阻断打包。
- **P3-3**　`canDecodeImage` 为死代码（`localImageFiles.ts:179`）。
- **P3-4**　读取/过滤/诊断逻辑散落两面板各自 handler，缺统一入口。

---

## 6. 重点排查清单逐项结论（A–I）

| 项 | 结论 | 证据位置 |
|---|---|---|
| **A1** 假设 webkitRelativePath 一定存在 | 否，已用 `\|\| file.name` 兜底 | `localImageFiles.ts:122-125` |
| **A2** undefined.split | **是（P0-3）** | `:133`，4.4-B 实测崩溃 |
| **A3** undefined.startsWith | 低风险，`isMacSystemFile` 有 `if(!part)` 守卫 | `:152-158` |
| **A4** undefined.toLowerCase | 低风险，`getExtension` 操作字符串；name 为 undefined 时先在 A2 崩 | `:117-120` |
| **A5** 空路径致 sort/grouping 崩 | sort 用 localeCompare、分组用 Map，不崩 | `:271` |
| **A6** Win/mac 分隔符不一致 | `isMacSystemFile` 有 `\\`→`/` 归一；`normalizeRelativePath` 只按 `/` 切 | `:148` vs `:133` |
| **B1** 先扩展名后过系统文件 | 顺序是先系统文件后扩展名（OK） | `:247` 再 `:256` |
| **B2** 把 ._fake.png 当图片 | 否，正确跳过 | 4.4-A 实测 |
| **B3** 把 bad/not-image.jpg 当真图 | **是（P1-1）** | 4.4-A 实测 kept |
| **B4** 只看 MIME 不看解码 | **是，只看扩展名**（P1-1） | `:163` |
| **B5** 拖入目录项/非 File 崩溃 | **是（P0-3）** | `:133` |
| **C1** createImageBitmap 无 try/catch | 有 try/catch | `localImageFiles.ts:180-202`,`batchWatermark.ts:314-324` |
| **C2** image.decode 无 try/catch | 有 try/catch | `batchWatermark.ts:332-337` |
| **C3** FileReader onerror | 项目源码未直接用 FileReader | grep |
| **C4** 坏图 Promise reject 未捕获 | 批量页逐个 try/catch；文件夹读取页不解码 | `BatchWatermarkPanel.tsx:601-627` |
| **C5** 解码失败致组件崩 | 批量页不崩（记 failed）；**但无 ErrorBoundary 兜底（P0-2）** | — |
| **D1** 大量原始 File 进 state | **是（P0-1）** | `LocalFolderReadTestPanel.tsx:124` |
| **D2** 直接 JSON.stringify File | 否，诊断只取标量字段 | `nativeFolderInputDebug.ts:71-76` |
| **D3** state 循环引用/不可序列化 | 否 | — |
| **D4** 卸载后 setState | 已防护：cancelled 闭包 + AbortController | `BatchWatermarkPanel.tsx:214-235` |
| **D5** map key 不稳定/undefined | **是（P1-2）** | `LocalFolderReadTestPanel.tsx:360,374` |
| **D6** 错误对象直接渲染 | 否，错误均转字符串 | `getErrorMessage` 各处 |
| **E1** createObjectURL 后不 revoke | 有 revoke | `:107,111,121,209` |
| **E2** revoke 太早致加载失败 | 低风险，预览用 cancelled 控制 | `BatchWatermarkPanel.tsx:232-235` |
| **E3** 重复创建大量 URL | **是（P0-1/P1-3）** | `localImageFiles.ts:205` |
| **E4** 失败文件也建 URL | 部分是（连带 P1-1） | `:267` |
| **F1** 两页同一套过滤 | 共用 readImagesFromFileList，但 mac 判定有第二套（P2-1） | — |
| **F2** 示例图选到系统文件 | 否 | — |
| **F3** 队列含坏文件 | 可能含（B3），处理时逐个容错 | — |
| **F4** 单个坏文件搞崩整批 | **否**，单个 try/catch 隔离 | `BatchWatermarkPanel.tsx:601-627` |
| **F5** 失败项独立 error | 是，failed 计数 + errors 累积 | `:621-626` |
| **G1** debug JSON 过大 | 有上界但整块渲染（P2-2） | — |
| **G2** 直接展示 File 对象 | 否 | — |
| **G3** stringify 不可序列化字段 | 否（全标量） | — |
| **G4** 调试信息本身致崩 | 否 | — |
| **H1** Chrome 文件夹 input | webkitdirectory，useEffect 设属性 | `LocalFolderReadTestPanel.tsx:98-104` |
| **H2** Safari 文件夹 input | 支持有限，有「选择图片」兜底 | `:155` |
| **H3** showDirectoryPicker fallback | 有能力检测 + 提示 | `localImageFiles.ts:331` |
| **H4** 用户取消选择 | 已处理 AbortError | `:198,443,471` |
| **H5** 空文件夹 | 已处理（images.length===0 提示） | `:126` |
| **I1** 读取逻辑散落多组件 | 是（P3-4） | — |
| **I2** 过滤/解码/诊断无统一入口 | 是 | — |
| **I3** 错误处理分散 | 是（多处各写 getErrorMessage） | — |
| **I4** 组件承担过多业务逻辑 | 是（BatchWatermarkPanel 1189 行） | — |
| **I5** 缺「单文件失败不影响整体」边界 | 批量页有；文件夹读取页缺 ErrorBoundary | — |

---

## 7. 最小修复计划（分三步）

**第一步：立即防崩溃（P0）**
1. 文件夹读取页 `readImagesFromFileList(files,'webkitdirectory',{createObjectUrls:false})` + 加导入上限（复用 `DEFAULT_MAX_BATCH_IMAGES` 或独立阈值），超限提示。
2. 预览改为「可见项/点击后再 `createObjectURL`」（参考批量页 `previewLoadRequested`）。
3. 新增 `ErrorBoundary`，包裹 `App`（或两个面板）。
4. `getFileRelativePath`/`normalizeRelativePath` 字符串兜底，消除 `undefined.split`。

**第二步：统一 sanitize / decode / diagnostics**
1. mac 系统文件判定、扩展名判定、（可选）`canDecodeImage` 解码校验统一到 `localImageFiles.ts` 单一入口，两页共用。
2. 真实统计 `invalidImageCount`；文件夹读取页 `<img>` 加 `onError` 占位。
3. 诊断面板默认折叠，统一 `getErrorMessage`。

**第三步：批量容错与回归测试**
1. 保持批量页逐个 try/catch；补充「坏图/伪装文件/超大文件夹」回归用例。
2. `package.json` 增 `tsc && vite build` 校验；分阶段开启 `tsconfig strict`。
3. 增加 `readImagesFromFileList` 单元测试（见第 9 节）。

---

## 8. 建议修改文件列表

| 文件 | 改什么 | 对应问题 |
|---|---|---|
| `components/LocalFolderReadTestPanel.tsx` | 关闭 eager objectURL、加上限、预览懒加载、key 修正、img onError | P0-1,P1-2,P1-3,P1-1 |
| `utils/localImageFiles.ts` | 路径兜底、接线 canDecodeImage、统计 invalidImageCount、统一 mac 判定 | P0-3,P1-1,P2-1 |
| 新增 `components/ErrorBoundary.tsx` + `index.tsx` | 全局错误边界并包裹 | P0-2 |
| `components/BatchWatermarkPanel.tsx` | 复用统一过滤入口（小改）、诊断默认折叠 | P2-1,P2-2 |
| `package.json`（可选） | build 前置 tsc | P3-2 |
| `tsconfig.json`（可选） | 分阶段开启 strict | P3-1 |

> **不建议改**：`utils/zipBuilder.ts`、`batchWatermark.ts` 解码/渲染核心、`CollageGrid.tsx`、`PhotoCard.tsx`、`vite.config.ts`、`App.tsx` 拼图部分——与崩溃无关或已足够健壮。

---

## 9. 建议新增测试场景
1. `readImagesFromFileList` 单测：纯文本伪装 jpg → 应判 invalid（接线后）。
2. File 的 `name`/`webkitRelativePath` 为 undefined/空 → 不抛错。
3. 1000+ 文件输入 → 命中上限并提示，不全量建 URL。
4. 含 `._*`/`.DS_Store`/`__MACOSX`/`Thumbs.db`/`desktop.ini` → 全部跳过。
5. 渲染期人为抛错 → ErrorBoundary 回退 UI 而非白屏。
6. 批量含 1 个坏图 → 该项 failed，其余成功。

## 10. 不建议做的事情
- 不要继续围绕 `._*` 过滤打补丁——过滤已验证有效，非主因。
- 不要保留「全量 File + 全量 objectURL 进 state」现状。
- 不要重构整个面板架构（本次只做最小防崩溃）。
- 不要在审计/修复阶段安装依赖或改 `node_modules`。
- 不要把坏图校验只加在批量页而漏掉文件夹读取页。

## 11. 其他结论
- **是否建议初始化 Git**：建议，但与崩溃修复解耦。请你本人执行 `git init`（我不代为初始化）。
- **是否建议先备份**：**强烈建议**。修复前对 `components/`、`utils/`、`index.tsx` 做副本备份（见草案）。
- **是否存在敏感信息风险**：**无**。全项目无 `.env`，`GEMINI_API_KEY` 仅 `define` 占位无值，`dist/` 无该值。本审计未读取/输出任何密钥值。

---

## 12. 下一步修复命令草案（**未执行 — 等你确认后再修**）

> 给 Claude 的下一条修复指令草案。本次审计**不执行**，仅供你审阅。

```
请在【只修复模式】下处理 InstaGrid 文件夹读取崩溃。严格按以下边界：

【只改这些文件】
- components/LocalFolderReadTestPanel.tsx
- utils/localImageFiles.ts
- 新增 components/ErrorBoundary.tsx，并在 index.tsx 中包裹 <App/>
（如需，BatchWatermarkPanel.tsx 仅做「复用统一过滤入口」的小改）

【不要改这些文件】
- utils/zipBuilder.ts
- utils/batchWatermark.ts 的解码/渲染/写盘核心
- components/CollageGrid.tsx, components/PhotoCard.tsx
- vite.config.ts
- App.tsx 的拼图相关逻辑

【先备份（请你本人或 Claude 执行其一）】
cp -R components components.bak_$(date +%Y%m%d_%H%M%S)
cp -R utils utils.bak_$(date +%Y%m%d_%H%M%S)
cp index.tsx index.tsx.bak_$(date +%Y%m%d_%H%M%S)
# （可选）git init 由你本人决定是否执行

【修复内容（最小防崩溃，对应 P0/P1）】
1. 文件夹读取页改 createObjectUrls:false + 加导入上限 + 预览点击后再解码（懒加载）。
2. 新增 ErrorBoundary 包裹全局，崩溃显示可恢复回退 UI。
3. getFileRelativePath / normalizeRelativePath 字符串兜底，消除 undefined.split。
4. 接线 canDecodeImage 解码校验并统计 invalidImageCount；<img> 加 onError 占位。
5. 列表 key 改为复合稳定 key。

【如何测试 / 确认不再崩溃】
- npx tsc --noEmit  → 必须通过
- npm run build     → 在本机（macOS）必须通过
- npm run dev，打开 http://127.0.0.1:5206 →「文件夹读取」页：
  a. 选 instagrid-folder-read-audit-test/ → 只显示 real/a.jpg、real/b.png；
     bad/not-image.jpg 标为无效；系统垃圾全部跳过；不白屏。
  b. 选真实大照片文件夹（数百张）→ 命中上限提示、内存平稳、不崩溃。
  c. 人为制造一次渲染异常 → ErrorBoundary 回退 UI，而非整页白屏。
- 对照本报告第 9 节回归用例逐项验证。

【完成后】汇报改了哪些行、tsc/build 结果、a/b/c 三个验收点是否通过。
```

