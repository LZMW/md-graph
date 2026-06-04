// =============================================================================
// installer — TDD 测试
// 测试: directory.ts, installer/targets/shared.ts, installer/targets/claude.ts
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// =============================================================================
// directory.ts 测试
// =============================================================================
describe('directory', () => {
  let findNearestMdGraphRoot: typeof import('./directory.js').findNearestMdGraphRoot;
  let isInitialized: typeof import('./directory.js').isInitialized;
  let getMdGraphDir: typeof import('./directory.js').getMdGraphDir;

  before(async () => {
    const mod = await import('./directory.js');
    findNearestMdGraphRoot = mod.findNearestMdGraphRoot;
    isInitialized = mod.isInitialized;
    getMdGraphDir = mod.getMdGraphDir;
  });

  it('getMdGraphDir — 应返回 .md-graph 路径', () => {
    const dir = getMdGraphDir('/project');
    assert.ok(dir.endsWith('.md-graph'));
    assert.ok(dir.length > '.md-graph'.length);
  });

  it('isInitialized — 无 .md-graph 目录应返回 false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-dir-'));
    try {
      assert.equal(isInitialized(tmpDir), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('isInitialized — 有 .md-graph 目录应返回 true', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-dir-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '.md-graph'));
      assert.equal(isInitialized(tmpDir), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('findNearestMdGraphRoot — 应在所在目录找到 .md-graph', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-root-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '.md-graph'));
      const result = findNearestMdGraphRoot(tmpDir);
      assert.equal(result, tmpDir);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('findNearestMdGraphRoot — 应在父目录找到 .md-graph', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-root-'));
    try {
      const subDir = path.join(tmpDir, 'a', 'b', 'c');
      fs.mkdirSync(subDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.md-graph'));
      const result = findNearestMdGraphRoot(subDir);
      assert.equal(result, tmpDir);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('findNearestMdGraphRoot — 未找到应返回 null', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-null-'));
    try {
      const result = findNearestMdGraphRoot(tmpDir);
      assert.equal(result, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// shared.ts 测试
// =============================================================================
describe('shared installer utilities', () => {
  let getMcpServerConfig: typeof import('./installer/targets/shared.js').getMcpServerConfig;
  let getMdGraphPermissions: typeof import('./installer/targets/shared.js').getMdGraphPermissions;
  let jsonDeepEqual: typeof import('./installer/targets/shared.js').jsonDeepEqual;
  let readJsonFile: typeof import('./installer/targets/shared.js').readJsonFile;
  let writeJsonFile: typeof import('./installer/targets/shared.js').writeJsonFile;

  before(async () => {
    const mod = await import('./installer/targets/shared.js');
    getMcpServerConfig = mod.getMcpServerConfig;
    getMdGraphPermissions = mod.getMdGraphPermissions;
    jsonDeepEqual = mod.jsonDeepEqual;
    readJsonFile = mod.readJsonFile;
    writeJsonFile = mod.writeJsonFile;
  });

  it('getMcpServerConfig — 应返回 md-graph serve --mcp 配置', () => {
    const config = getMcpServerConfig();
    assert.equal(config.command, 'md-graph');
    assert.deepEqual(config.args, ['serve', '--mcp']);
  });

  it('getMdGraphPermissions — 应返回 3 个工具权限', () => {
    const perms = getMdGraphPermissions();
    assert.ok(Array.isArray(perms));
    assert.equal(perms.length, 3);
    assert.ok(perms.includes('mcp__md-graph__md_status'));
    assert.ok(perms.includes('mcp__md-graph__md_search'));
    assert.ok(perms.includes('mcp__md-graph__md_navigate'));
  });

  it('jsonDeepEqual — 相同对象应返回 true', () => {
    assert.equal(jsonDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  });

  it('jsonDeepEqual — 不同对象应返回 false', () => {
    assert.equal(jsonDeepEqual({ a: 1 }, { a: 2 }), false);
  });

  it('jsonDeepEqual — 数组比较', () => {
    assert.equal(jsonDeepEqual([1, 2, 3], [1, 2, 3]), true);
    assert.equal(jsonDeepEqual([1, 2], [1, 2, 3]), false);
  });

  it('readJsonFile — 文件不存在应返回 {}', () => {
    const result = readJsonFile('/nonexistent/path.json');
    assert.deepEqual(result, {});
  });

  it('readJsonFile — 文件存在应解析 JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-json-'));
    try {
      const filePath = path.join(tmpDir, 'test.json');
      fs.writeFileSync(filePath, JSON.stringify({ hello: 'world' }));
      const result = readJsonFile(filePath);
      assert.equal(result.hello, 'world');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writeJsonFile — 应写入带尾换行的 JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-write-'));
    try {
      const filePath = path.join(tmpDir, 'output.json');
      writeJsonFile(filePath, { foo: 'bar' });
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.endsWith('\n'));
      assert.ok(content.includes('"foo"'));
      assert.ok(content.includes('"bar"'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// claude.ts 测试
// =============================================================================
describe('claude installer target', () => {
  let writeMcpEntry: typeof import('./installer/targets/claude.js').writeMcpEntry;
  let writePermissionsEntry: typeof import('./installer/targets/claude.js').writePermissionsEntry;
  let mcpJsonPath: typeof import('./installer/targets/claude.js').mcpJsonPath;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  before(async () => {
    const mod = await import('./installer/targets/claude.js');
    writeMcpEntry = mod.writeMcpEntry;
    writePermissionsEntry = mod.writePermissionsEntry;
    mcpJsonPath = mod.mcpJsonPath;
  });

  it('mcpJsonPath — global 应返回 ~/.claude.json', () => {
    const p = mcpJsonPath('global');
    assert.ok(p.endsWith('.claude.json'));
  });

  it('writeMcpEntry — 应写入 MCP 配置到临时文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-mcp-'));
    try {
      // 模拟 global scope: 在临时目录创建 .claude.json
      const fakeHome = path.join(tmpDir, 'home');
      fs.mkdirSync(fakeHome, { recursive: true });
      const originalHomeDir = process.env.HOME;
      const originalUserDir = process.env.USERPROFILE;
      process.env.HOME = fakeHome;
      process.env.USERPROFILE = fakeHome;

      const result = writeMcpEntry('global');
      assert.ok(result.action === 'created' || result.action === 'updated');
      // 验证文件内容
      const mcpFilePath = path.join(fakeHome, '.claude.json');
      assert.ok(fs.existsSync(mcpFilePath));
      const content = JSON.parse(fs.readFileSync(mcpFilePath, 'utf-8'));
      assert.ok(content.mcpServers);
      assert.ok(content.mcpServers['md-graph']);
      assert.equal(content.mcpServers['md-graph'].command, 'md-graph');

      // 恢复环境变量
      if (originalHomeDir) process.env.HOME = originalHomeDir;
      else delete process.env.HOME;
      if (originalUserDir) process.env.USERPROFILE = originalUserDir;
      else delete process.env.USERPROFILE;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writePermissionsEntry — 应写入权限到 settings.json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-perm-'));
    try {
      const fakeClaudeDir = path.join(tmpDir, 'home', '.claude');
      fs.mkdirSync(fakeClaudeDir, { recursive: true });
      const originalHomeDir = process.env.HOME;
      const originalUserDir = process.env.USERPROFILE;
      process.env.HOME = path.join(tmpDir, 'home');
      process.env.USERPROFILE = path.join(tmpDir, 'home');

      const result = writePermissionsEntry('global');
      assert.ok(result.action === 'created' || result.action === 'updated');

      const settingsPath = path.join(fakeClaudeDir, 'settings.json');
      assert.ok(fs.existsSync(settingsPath));
      const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.ok(content.permissions);
      assert.ok(Array.isArray(content.permissions.allow));
      assert.ok(content.permissions.allow.includes('mcp__md-graph__md_status'));

      // 恢复环境变量
      if (originalHomeDir) process.env.HOME = originalHomeDir;
      else delete process.env.HOME;
      if (originalUserDir) process.env.USERPROFILE = originalUserDir;
      else delete process.env.USERPROFILE;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
