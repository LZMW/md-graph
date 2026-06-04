// =============================================================================
// claude.ts — Claude Code MCP 配置安装器
//
// 参照 CodeGraph installer/targets/claude.ts 的实现模式。
// 写入：
//   1. MCP 服务器入口到 ~/.claude.json（global）或 ./.mcp.json（local）
//   2. 权限到 ~/.claude/settings.json（global）或 ./.claude/settings.json（local）
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getMdGraphPermissions,
  getMcpServerConfig,
  jsonDeepEqual,
  readJsonFile,
  writeJsonFile,
} from './shared.js';

export type Location = 'global' | 'local';

/**
 * 获取 .claude 配置目录路径
 */
function configDir(loc: Location): string {
  return loc === 'global'
    ? path.join(os.homedir(), '.claude')
    : path.join(process.cwd(), '.claude');
}

/**
 * MCP JSON 文件路径。
 * - global → ~/.claude.json（用户级，所有项目可见）
 * - local  → ./.mcp.json（项目级，Claude Code 实际读取的文件）
 */
export function mcpJsonPath(loc: Location): string {
  return loc === 'global'
    ? path.join(os.homedir(), '.claude.json')
    : path.join(process.cwd(), '.mcp.json');
}

/**
 * settings.json 路径
 */
function settingsJsonPath(loc: Location): string {
  return path.join(configDir(loc), 'settings.json');
}

// =============================================================================
// 写入 MCP 入口
// =============================================================================

export interface WriteResult {
  path: string;
  action: 'created' | 'updated' | 'unchanged';
}

/**
 * 向 MCP JSON 文件中写入 md-graph 服务器入口。
 *
 * - global: ~/.claude.json 中的 mcpServers.md-graph
 * - local:  ./.mcp.json 中的 mcpServers.md-graph
 */
export function writeMcpEntry(loc: Location): WriteResult {
  const file = mcpJsonPath(loc);
  const existing = readJsonFile(file);

  // 读取已有的 mcpServers 配置（可能是对象或 undefined）
  const mcpServers = existing.mcpServers as Record<string, unknown> | undefined;
  const before = mcpServers?.['md-graph'];
  const after = getMcpServerConfig();

  if (jsonDeepEqual(before as unknown, after as unknown)) {
    // 已完全匹配 — 无需写入
    return { path: file, action: 'unchanged' };
  }

  const action: 'created' | 'updated' =
    before !== undefined
      ? 'updated'
      : fs.existsSync(file)
        ? 'updated'
        : 'created';

  // 构建新的 mcpServers 对象
  const newMcpServers: Record<string, unknown> = mcpServers ?? {};
  newMcpServers['md-graph'] = after;
  existing.mcpServers = newMcpServers;
  writeJsonFile(file, existing);

  return { path: file, action };
}

// =============================================================================
// 写入权限
// =============================================================================

/**
 * 向 Claude settings.json 写入 md-graph 工具权限白名单。
 * - global: ~/.claude/settings.json
 * - local:  ./.claude/settings.json（不存在则跳过）
 */
export function writePermissionsEntry(loc: Location): WriteResult {
  const file = settingsJsonPath(loc);

  // local 模式，settings.json 不存在时跳过
  if (loc === 'local' && !fs.existsSync(file)) {
    return { path: file, action: 'unchanged' };
  }

  const settings = readJsonFile(file);
  const created = !fs.existsSync(file);

  // 初始化 permissions 结构
  const permissions = (settings.permissions as Record<string, unknown>) ?? {};
  const allow = (permissions.allow as string[]) ?? [];
  const before = [...allow];

  const want = getMdGraphPermissions();
  for (const perm of want) {
    if (!allow.includes(perm)) {
      allow.push(perm);
    }
  }

  // 回写 permissions
  permissions.allow = allow;
  settings.permissions = permissions;

  if (jsonDeepEqual(before as unknown, allow as unknown) && !created) {
    return { path: file, action: 'unchanged' };
  }

  writeJsonFile(file, settings);
  return { path: file, action: created ? 'created' : 'updated' };
}
