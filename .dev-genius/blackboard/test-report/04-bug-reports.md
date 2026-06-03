# Bug 报告清单 — 第 2 批: T-002, T-005, T-006

> gen: gen-1 | 更新时间: 2026-06-03T23:05:00+08:00

## Bug 统计

| P0 阻塞 | P1 严重 | P2 一般 | P3 建议 |
|---------|---------|---------|---------|
| 0 | 1 | 1 | 0 |

---

### BUG-001: @modelcontextprotocol/sdk 入口文件缺失

| 属性 | 内容 |
|------|------|
| **严重程度** | P1 严重 |
| **状态** | 待修复 |
| **环境** | Node.js v24.14.0, Windows 11 |
| **发现时间** | 2026-06-03T23:05:00+08:00 |
| **复现步骤** | 1. `cd N:/编程工作室/mcp/md-graph` 2. 执行 `node --input-type=module -e "import('@modelcontextprotocol/sdk')"` |
| **预期结果** | SDK 应成功导入，不报错 |
| **实际结果** | `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...dist/esm/index.js'` |
| **影响范围** | 项目依赖 `@modelcontextprotocol/sdk` 用于 MCP 服务器实现。当前 `src/api/mcp-server.ts` 需要此依赖才能运行。开发脚本 `npm run dev` 和 `npm run start:mcp` 均无法正常工作。 |
| **根因分析** | `node_modules/@modelcontextprotocol/sdk/dist/esm/index.js` 不存在。SDK 的 `exports` 配置指向 `./dist/esm/index.js` 但该文件未构建。可能原因：(1) npm 包发布时未包含 dist 目录的完整编译产物；(2) 安装过程被中断或部分失败。 |
| **临时方案** | 尝试手动重建 SDK：`cd node_modules/@modelcontextprotocol/sdk && npm run build`（需 SDK 的 devDependencies 已安装） |
| **关联用例** | TC-DEP-001 |

---

### BUG-002: FileStore 缺少 byte/line 范围读取功能

| 属性 | 内容 |
|------|------|
| **严重程度** | P2 一般 |
| **状态** | 待确认 |
| **环境** | Windows 11 |
| **发现时间** | 2026-06-03T23:05:00+08:00 |
| **复现步骤** | 1. 查阅 `src/storage/filestore.ts` 接口定义 2. `read(relativePath: string): Promise<string>` 仅支持整文件读取 |
| **预期结果** | FileStore 应提供按 byte 范围或 line 范围的读取方法（如 `readBytes(relativePath, start, end)` 或 `readLines(relativePath, startLine, endLine)`） |
| **实际结果** | 当前仅 `read()` 方法读取整个文件内容 |
| **影响范围** | 如果后续需要分段读取大文件或随机访问文件区域，当前实现不满足需求 |
| **备注** | 此问题可能为需求尚未实现，而非 Bug。需协调器确认 AC-05 是否为当前迭代必须实现。 |
