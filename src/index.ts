// =============================================================================
// md-graph — 入口点
// 导出 MdGraph 类 + CLI 启动逻辑
// =============================================================================
export { MdGraph } from './md-graph.js';
export type { MdGraphStatus, MdGraphOptions } from './md-graph.js';
export { createCli, runCli, main } from './cli.js';
export type { SearchResult, SearchOptions, NavResult, Direction, IndexResult } from './types.js';
