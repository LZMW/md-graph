# review-report 子索引 — 第 2 批 + 第 5-6-7 批

> gen: gen-1 | 最后更新: 2026-06-03T23:35:00+08:00

## 文件结构

| # | 文件 | 用途 | 关键章节 |
|---|------|------|----------|
| 01 | `01-code-review.md` | 代码审查报告（第 2 批: T-002/T-005/T-006） | Karpathy 四原则 + OWASP + 7.75/10 |
| 02 | `01-code-review-batch3.md` | 代码审查报告（第 3 批: T-007/T-008） | Parser 模块审查 + 8.5/10 |
| **03** | **`02-code-review-batch567.md`** | **代码审查报告（第 5-6-7 批: T-012~T-019）** | **全模块审查 + 8.5/10 + 8 项待处理** |

## 审查范围

- **第 2 批**: FileStore, SqliteDbAdapter, schema.sql, types.ts — 综合 7.75/10
- **第 3 批**: ParserRegistry, MarkdownParser, base-parser — 综合 8.5/10
- **第 5-6-7 批**: Watcher, MdGraph Facade, TemplateEngine, MCP Server, CLI, Entry Point, README, Integration Tests — 综合 8.5/10

## 关键数据

| 批次 | 文件数 | 综合评分 | 关键问题 |
|------|--------|---------|---------|
| Batch 2 | 6 | 7.75/10 | CR-01 路径遍历 (已修复) |
| Batch 3 | 5 | 8.5/10 | Q-01 死代码, Q-04 重复方法 |
| **Batch 5-6-7** | **15** | **8.5/10** | **R-07/R-08 参数类型校验 (P2)** |

## 优先阅读

- `02-code-review-batch567.md` — 最新批次审查，覆盖全部 15 个新增文件
- `01-code-review.md` — 基础模块（FileStore/DB）安全审查
