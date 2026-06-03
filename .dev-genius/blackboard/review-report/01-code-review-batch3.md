# 代码审查报告 — 第 3 批: T-007, T-008

> gen: gen-1 | 审查时间: 2026-06-03T23:10:00+08:00

## 审查范围

| 文件 | 语言 | 行数 | 用途 |
|------|------|------|------|
| `src/analysis/parser/base-parser.ts` | TypeScript | 25 | DocumentParser 接口定义 |
| `src/analysis/parser/index.ts` | TypeScript | 41 | ParserRegistry 注册表 |
| `src/analysis/parser/md-parser.ts` | TypeScript | 512 | MarkdownParser 实现 |
| `src/analysis/parser/parser.test.ts` | TypeScript | 123 | ParserRegistry 单元测试 |
| `src/analysis/parser/md-parser.test.ts` | TypeScript | 312 | MarkdownParser 单元测试 |

## Karpathy 四原则审查

### 1. 可读性 (Readability) — 评分: 8/10

**优点**:
- 清晰的模块划分：base-parser.ts（接口）→ index.ts（注册表）→ md-parser.ts（实现）
- 每个方法都有 JSDoc 注释说明用途
- 内部状态封装在 `ParseState` 接口中，职责单一
- token 处理的 switch-case 结构清晰，易于跟踪

**问题**:
- (Q-01) `md-parser.ts:415-453` — `extractLinks` 方法的第一个循环是死代码。它创建了一个 `links` 数组但从未使用（第 453 行立即返回 `extractLinksAccurate` 的结果）。应该删除死代码的第一次循环体。
- (Q-02) `md-parser.ts:402-405` — `createDocumentNode` 中的循环 `for (const h of state.headings) { if (h.nodeId === 0) h.nodeId = 0; }` 是无操作循环（no-op loop），没有实际效果。应该删除。
- (Q-03) `code_block` 的 `metadata.codeBlocks` 中 `language` 始终为 `undefined`（`md-parser.ts:112-118`），因为 MarkdownParser 没有将编程语言信息传递到 metadata 中。fence token 的 `info` 属性包含语言信息（如 `typescript`），但在创建 node 时被内联到 `content` 中（第 230-232 行），metadata 层没有被填充。

### 2. 简洁性 (Simplicity) — 评分: 9/10

**优点**:
- ParserRegistry 仅 5 个方法，职责单一
- MarkdownParser 的 7 个 handler 各处理一种 token 类型，没有过度抽象

**问题**:
- (Q-04) `extractLinks` 和 `extractLinksAccurate` 是同一功能的两个版本。由于第一个是死代码（Q-01），实际工作中只有 `extractLinksAccurate` 被调用。应该只保留这一个方法并改名。

### 3. 正确性 (Correctness) — 评分: 9/10

**优点**:
- 测试覆盖了所有 7 种节点类型
- headingPath 层级堆栈管理正确（push/pop 逻辑符合 Markdown 语义）
- parent_id 分配逻辑正确（headings 栈顶作为父节点）
- link 分类（internal/external/anchor）边界覆盖完整
- contentHash 一致性验证通过

**问题**:
- (Q-05) `classifyHref` 方法（第 507-511 行）对外部链接的判断只匹配 `http://` 和 `https://` 协议，但不匹配 `ftp://`、`mailto:` 等其他协议。虽然对当前用例影响不大，但协议覆盖不全。

### 4. 可维护性 (Maintainability) — 评分: 8/10

**优点**:
- 接口（DocumentParser）和实现（MarkdownParser）分离，便于添加新格式解析器
- 测试覆盖率达到 ~95%（分支覆盖可能需要提升）
- 错误处理一致：文件路径传递贯穿所有节点

**问题**:
- (Q-06) `MarkdownParser` 的 `readonly unsuitableFor` 使用了字符串数组，但最佳实践应该是返回 `string[]` 或者用 `string | undefined` 来区分"不适用的场景"和"没有声明"。当前写法是正确的但不够类型安全。

## OWASP 安全审查

### CR-01 路径遍历 (已确认修复)
| 条目 | 内容 |
|------|------|
| **文件** | `filestore.ts` — resolvePath 方法 |
| **风险** | 路径遍历攻击 — 攻击者通过 `../../../etc/passwd` 读取系统文件 |
| **修复确认** | `resolvePath` 使用 `path.resolve()` 后再检查是否在 rootPath 内，通过 `!resolved.startsWith(normalizedRoot + path.sep)` 拦截越界路径 |
| **测试覆盖** | 3 个测试（read/stat/exists 路径遍历）全部通过 |

### CR-02: markdown-it 安全性
| 条目 | 内容 |
|------|------|
| **文件** | `md-parser.ts:41` |
| **风险** | markdown-it 配置了 `html: true`，允许在 Markdown 中嵌入 HTML。如果用户文档包含恶意 HTML/JS，解析器不会进行过滤（XSS 风险）。 |
| **影响** | 当前 md-graph 只在本地文件系统解析文档，不涉及浏览器渲染，XSS 风险低。但如果未来添加 Web 展示功能，需要引入 HTML 净化（如 DOMPurify）。 |
| **建议** | 在 `unsuitableFor` 声明中记录此限制。当前阶段无需修改，但需记录风险。 |

## 审查结论

### 综合评分: 8.5/10

| 维度 | 评分 | 关键问题 |
|------|------|----------|
| 可读性 | 8/10 | Q-01 死代码, Q-02 no-op 循环, Q-03 code_block language |
| 简洁性 | 9/10 | Q-04 冗余方法 |
| 正确性 | 9/10 | Q-05 协议覆盖有限 |
| 可维护性 | 8/10 | Q-06 unsuitableFor 类型声明 |
| 安全性 | 9/10 | markdown-it html:true 记录风险 |
| **总分** | **8.5/10** | |

### 待处理问题

| ID | 优先级 | 描述 | 类型 |
|----|--------|------|------|
| Q-01 | P2 | `extractLinks` 方法中的死代码（第一个循环从未使用） | 清理 |
| Q-02 | P3 | `createDocumentNode` 中无操作循环 | 清理 |
| Q-03 | P3 | code_block metadata 的 language 始终为 undefined | 改进 |
| Q-04 | P2 | `extractLinks` 和 `extractLinksAccurate` 冗余 | 简化 |
| Q-05 | P4 | `classifyHref` 协议覆盖不完整 | 增强 |
| CR-02 | P4 | markdown-it html:true 的 XSS 风险记录 | 文档 |
