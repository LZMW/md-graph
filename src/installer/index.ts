// =============================================================================
// installer/index.ts — md-graph MCP 安装器
//
// 简化版安装器：直接执行全局安装（global scope）。
// 将 md-graph 注册为 Claude Code 的 MCP 服务器。
//
// 参照 CodeGraph installer/index.ts 的实现模式，但省略了交互式 prompt
// 和 multi-target 支持，专注于 Claude Code 这一个目标。
// =============================================================================
import {
  writeMcpEntry,
  writePermissionsEntry,
} from './targets/claude.js';

function actionLabel(action: string): string {
  switch (action) {
    case 'created':
      return '已创建';
    case 'updated':
      return '已更新';
    case 'unchanged':
      return '已存在';
    default:
      return `[${action}]`;
  }
}

/**
 * 运行安装器。
 * 1. 写入 MCP 服务器入口到 ~/.claude.json
 * 2. 写入工具权限白名单到 ~/.claude/settings.json
 *
 * 安装完成后需要重启 Claude Code 才能生效。
 */
export function runInstaller(): void {
  console.log('正在安装 md-graph MCP 服务器...');

  // 1. MCP 服务器入口（全局）
  const mcpResult = writeMcpEntry('global');
  const mcpVerb = actionLabel(mcpResult.action);
  console.log(`  ${mcpVerb} ${mcpResult.path}`);

  // 2. 权限白名单（全局）
  const permResult = writePermissionsEntry('global');
  const permVerb = actionLabel(permResult.action);
  console.log(`  ${permVerb} ${permResult.path}`);

  console.log('');
  console.log('md-graph MCP 安装完成。');
  console.log('');
  console.log('使用方式:');
  console.log('  1. 在 Markdown 项目根目录运行: md-graph init');
  console.log('  2. 重启 Claude Code');
  console.log('  3. 使用 md_status / md_search / md_navigate 工具');
}
