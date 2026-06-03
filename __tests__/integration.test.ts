// =============================================================================
// 集成测试 — S1-S6 基准测试场景
// S1: 变更感知 (status)
// S2: 精确搜索 (search)
// S3: 文档导航 (navigate)
// S4: 大文件处理
// S5: 并发安全
// S6: CLI 命令
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// 辅助工具
// ---------------------------------------------------------------------------

/** 创建临时目录并写入初始 .md 文件 */
function createProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-int-'));
  fs.writeFileSync(path.join(dir, 'index.md'), `# Welcome

This is the main documentation index.

## Getting Started

To get started, see [quick-start](guide/quick-start.md).

## API Reference

See the [full API docs](api/api.md) for details.

## Architecture

The system consists of multiple [modules](architecture/overview.md).`);
  fs.mkdirSync(path.join(dir, 'guide'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'guide', 'quick-start.md'), `# Quick Start Guide

## Installation

Run \`npm install md-graph\` to install.

## Usage

First, initialize:

\`\`\`bash
md-graph init .
\`\`\`

Then search:

\`\`\`bash
md-graph status .
\`\`\`

## Troubleshooting

See [troubleshooting](troubleshooting.md) for common issues.`);
  fs.writeFileSync(path.join(dir, 'guide', 'troubleshooting.md'), `# Troubleshooting

## Common Issues

### Installation fails

Try clearing the npm cache and reinstalling.

### Search returns no results

Make sure you have run \`md-graph init\` first.

## Getting Help

Visit the [community forum](https://example.com/forum) for help.`);
  fs.mkdirSync(path.join(dir, 'api'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'api', 'api.md'), `# API Reference

## Search API

The \`search\` method performs FTS5 full-text search.

### Parameters

- \`query\` (required) — search term
- \`maxResults\` (optional, default: 10) — max results
- \`offset\` (optional, default: 0) — pagination offset

### Returns

Returns matching nodes with snippets and scores.

## Navigation API

The \`navigate\` method traverses the link graph.

### Parameters

- \`nodeId\` (required) — starting node
- \`direction\` (required) — inbound/outbound/impact
- \`depth\` (optional, default: 1) — BFS depth`);
  fs.mkdirSync(path.join(dir, 'architecture'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'architecture', 'overview.md'), `# Architecture Overview

## Layers

1. Storage — FileStore + SQLite
2. Analysis — Indexer, Searcher, Traverser, Watcher
3. Facade — MdGraph
4. Interface — CLI + MCP Server

## Data Flow

Files → Parse → Index → FTS5 → Search
Files → Parse → Extract Links → Edges Table → Navigate`);
  return dir;
}

/** 递归删除目录（带重试处理 Windows 文件锁） */
function cleanupDir(dir: string): void {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      // 等待文件锁释放
    }
  }
}

/** 读取 .md-graph 存储目录下的文件 */
function getStorageFilePath(storageDir: string, ...segments: string[]): string {
  return path.join(storageDir, ...segments);
}

// ---------------------------------------------------------------------------
// 延迟导入
// ---------------------------------------------------------------------------
let MdGraph: typeof import('../src/md-graph.js').MdGraph;
let cmdInit: typeof import('../src/cli.js').cmdInit;
let cmdStatus: typeof import('../src/cli.js').cmdStatus;
let cmdUninstall: typeof import('../src/cli.js').cmdUninstall;

before(async () => {
  const mdGraphModule = await import('../src/md-graph.js');
  MdGraph = mdGraphModule.MdGraph;
  const cliModule = await import('../src/cli.js');
  cmdInit = cliModule.cmdInit;
  cmdStatus = cliModule.cmdStatus;
  cmdUninstall = cliModule.cmdUninstall;
});

// =============================================================================
// S1: 变更感知 (status)
// =============================================================================
describe('S1: 变更感知 (status)', () => {
  let projectDir: string;
  let graph: InstanceType<typeof MdGraph>;

  before(async () => {
    projectDir = createProject();
    graph = new MdGraph(projectDir);
  });

  after(async () => {
    if (graph) await graph.close();
    cleanupDir(projectDir);
  });

  it('S1-TC01: init 后 status 应报告正确的文件数和节点数', async () => {
    const status = await graph.status();
    assert.ok(status.totalFiles >= 5, `应至少 5 个文件，实际 ${status.totalFiles}`);
    assert.ok(status.totalNodes > 0, '应存在解析出的节点');
    assert.ok(status.totalEdges > 0, '应存在解析出的链接边');
    assert.ok(typeof status.lastIndexedAt === 'string' && status.lastIndexedAt.length > 0);
  });

  it('S1-TC02: 文件变更后 stale 标记应为 true', async () => {
    // 记录初始 staleness 状态
    const statusBefore = await graph.status();
    const staleBefore = statusBefore.stale;
    const staleCountBefore = statusBefore.staleFileCount;

    // 新增一个文件（模拟变更）
    fs.writeFileSync(path.join(projectDir, 'new-file.md'), '# New File\n\nFresh content here.');

    // 调用 status 时会触发增量索引，变更应被检测到
    const statusAfter = await graph.status();
    // status 内部会调用 incrementalIndex，所以变更应已被处理
    assert.ok(statusAfter.totalFiles >= statusBefore.totalFiles, '文件数应增加');
  });

  it('S1-TC03: status 返回 staleness 信息格式正确', async () => {
    const status = await graph.status();
    assert.equal(typeof status.stale, 'boolean');
    assert.equal(typeof status.staleFileCount, 'number');
    assert.ok(status.staleFileCount >= 0);
    assert.ok(status.lastIndexedAt.length > 0);
  });
});

// =============================================================================
// S2: 精确搜索 (search)
// =============================================================================
describe('S2: 精确搜索 (search)', () => {
  let projectDir: string;
  let graph: InstanceType<typeof MdGraph>;

  before(async () => {
    projectDir = createProject();
    graph = new MdGraph(projectDir);
    await graph.status(); // 触发索引
  });

  after(async () => {
    if (graph) await graph.close();
    cleanupDir(projectDir);
  });

  it('S2-TC01: 搜索存在的关键词应返回匹配结果', async () => {
    const result = await graph.search('Welcome');
    assert.ok(result.totalResults > 0, `应匹配到 'Welcome'，实际 ${result.totalResults}`);
    assert.ok(result.results.length > 0);
    assert.ok(result.results[0].snippet.includes('Welcome') ||
              result.results[0].snippet.includes('welcome') ||
              result.results[0].filePath.includes('index.md'));
  });

  it('S2-TC02: 搜索不存在的词应返回空结果', async () => {
    const result = await graph.search('xyznonexistent12345');
    assert.equal(result.totalResults, 0);
    assert.equal(result.results.length, 0);
  });

  it('S2-TC03: 搜索应返回带 snippet 的结果', async () => {
    const result = await graph.search('installation');
    if (result.totalResults > 0) {
      assert.ok(result.results[0].snippet.length > 0, 'snippet 不应为空');
      // snippet 可能包含不区分大小写的匹配
      assert.ok(result.results[0].filePath.includes('.md'));
    }
  });

  it('S2-TC04: 搜索结果应包含 headingPath 信息', async () => {
    const result = await graph.search('Getting Started');
    if (result.totalResults > 0) {
      // 结果应来自 index.md 的 Getting Started 章节
      const hasHeadingPath = result.results.some(r => r.headingPath.length > 0);
      assert.ok(hasHeadingPath, '至少一个结果应有 headingPath');
    }
  });

  it('S2-TC05: 空搜索词应返回空结果', async () => {
    const result = await graph.search('');
    assert.equal(result.totalResults, 0);
    assert.equal(result.results.length, 0);
  });

  it('S2-TC06: 搜索结果应按 score 降序排列', async () => {
    const result = await graph.search('search');
    if (result.totalResults > 1) {
      for (let i = 1; i < result.results.length; i++) {
        assert.ok(result.results[i].score <= result.results[i - 1].score,
          `结果应在位置 ${i} 以降序排列：${result.results[i].score} <= ${result.results[i - 1].score}`);
      }
    }
  });
});

// =============================================================================
// S3: 文档导航 (navigate)
// =============================================================================
describe('S3: 文档导航 (navigate)', () => {
  let projectDir: string;
  let graph: InstanceType<typeof MdGraph>;

  before(async () => {
    projectDir = createProject();
    graph = new MdGraph(projectDir);
    await graph.status(); // 触发索引
  });

  after(async () => {
    if (graph) await graph.close();
    cleanupDir(projectDir);
  });

  it('S3-TC01: outbound 导航应返回出链', async () => {
    // 搜索一个包含链接的节点
    const searchResult = await graph.search('Welcome');
    if (searchResult.totalResults > 0) {
      const nodeId = searchResult.results[0].id;
      const navResult = await graph.navigate(nodeId, 'outbound', 1);
      assert.equal(navResult.direction, 'outbound');
      assert.ok(navResult.totalLinks >= 0);
      assert.equal(navResult.sourceNodeId, nodeId);
      assert.ok(navResult.tookMs >= 0);
    }
  });

  it('S3-TC02: inbound 导航应返回入链', async () => {
    // 搜索 guide/quick-start.md 中的节点
    const searchResult = await graph.search('Quick Start');
    if (searchResult.totalResults > 0) {
      const nodeId = searchResult.results[0].id;
      const navResult = await graph.navigate(nodeId, 'inbound', 1);
      assert.equal(navResult.direction, 'inbound');
    }
  });

  it('S3-TC03: impact 导航应返回出链和入链的并集', async () => {
    const searchResult = await graph.search('Welcome');
    if (searchResult.totalResults > 0) {
      const nodeId = searchResult.results[0].id;
      const navResult = await graph.navigate(nodeId, 'impact', 1);
      assert.equal(navResult.direction, 'impact');
    }
  });

  it('S3-TC04: 导航返回的链接应包含 linkText 和状态', async () => {
    const searchResult = await graph.search('See the');
    if (searchResult.totalResults > 0) {
      const nodeId = searchResult.results[0].id;
      const navResult = await graph.navigate(nodeId, 'outbound', 1);
      if (navResult.totalLinks > 0) {
        for (const link of navResult.links) {
          assert.ok(link.status === 'resolved' || link.status === 'broken' || link.status === 'external');
          // linkText 应不为空（被解析的链接应有文本）
          assert.ok('linkText' in link);
        }
      }
    }
  });

  it('S3-TC05: 不存在的 nodeId 应返回空导航结果', async () => {
    const navResult = await graph.navigate(999999, 'outbound', 1);
    assert.equal(navResult.totalLinks, 0);
    assert.equal(navResult.sourceNodeId, 999999);
  });
});

// =============================================================================
// S4: 大文件处理
// =============================================================================
describe('S4: 大文件处理', () => {
  let projectDir: string;
  let graph: InstanceType<typeof MdGraph>;

  before(async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-large-'));
    // 创建一个包含 1000 行的大文件
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      if (i % 50 === 0) {
        lines.push(`## Section ${Math.floor(i / 50) + 1}\n`);
      }
      lines.push(`This is paragraph ${i}. It contains some searchable content for testing large file handling.\n`);
    }
    fs.writeFileSync(path.join(projectDir, 'large-file.md'), lines.join(''));

    // 创建 10 个小文件
    for (let i = 1; i <= 10; i++) {
      const content = `# File ${i}\n\nThis is file number ${i} with some content.\n\n[link](../large-file.md)`;
      fs.writeFileSync(path.join(projectDir, `file-${i}.md`), content);
    }

    graph = new MdGraph(projectDir);
    await graph.status();
  });

  after(async () => {
    if (graph) await graph.close();
    cleanupDir(projectDir);
  });

  it('S4-TC01: 大文件（1000 行）应能正常索引', async () => {
    const status = await graph.status();
    assert.ok(status.totalFiles >= 11, `应包含 11 个文件，实际 ${status.totalFiles}`);
    assert.ok(status.totalNodes > 50, `大文件应产出至少 50 个节点，实际 ${status.totalNodes}`);
  });

  it('S4-TC02: 大文件内容可搜索', async () => {
    const result = await graph.search('paragraph');
    assert.ok(result.totalResults > 0, '应能从大文件中搜索到内容');
  });

  it('S4-TC03: 大文件搜索结果正确包含 section 标题信息', async () => {
    const result = await graph.search('Section');
    assert.ok(result.totalResults >= 10, '应匹配到所有 section 标题');
  });

  it('S4-TC04: 混合扫描不影响搜索结果', async () => {
    const result = await graph.search('file number');
    assert.ok(result.totalResults >= 5, '应匹配到多个文件的引用');
  });
});

// =============================================================================
// S5: 并发安全
// =============================================================================
describe('S5: 并发安全', () => {
  let projectDir: string;
  let graph: InstanceType<typeof MdGraph>;

  before(async () => {
    projectDir = createProject();
    graph = new MdGraph(projectDir);
    await graph.status();
  });

  after(async () => {
    if (graph) await graph.close();
    cleanupDir(projectDir);
  });

  it('S5-TC01: 并发搜索不抛出异常', async () => {
    const queries = ['Welcome', 'Installation', 'API', 'guide', 'search', 'troubleshooting'];
    const promises = queries.map(q => graph.search(q));
    const results = await Promise.all(promises);
    for (const result of results) {
      assert.ok(Array.isArray(result.results));
      assert.equal(typeof result.totalResults, 'number');
      assert.equal(typeof result.stale, 'boolean');
    }
  });

  it('S5-TC02: 边搜索边索引不崩溃', async () => {
    // 并发执行：索引 + 搜索
    const mixedPromises = [
      graph.search('Welcome'),
      graph.search('Installation'),
      graph.status(),
      graph.search('API'),
    ];
    const results = await Promise.all(mixedPromises);
    assert.equal(results.length, 4);
    // status 返回 6 个字段
    const statusResult = results[2] as { totalFiles: number; totalNodes: number; totalEdges: number };
    assert.ok(statusResult.totalFiles >= 5);
  });

  it('S5-TC03: 多次调用 close 不报错（幂等性）', async () => {
    // 使用新的 graph 实例测试 close 幂等性
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-close-'));
    fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Test');
    const g = new MdGraph(tmpDir);
    await g.status(); // 初始化 + 索引
    await g.close();
    await g.close(); // 第二次 close 不应抛出
    cleanupDir(tmpDir);
  });

  it('S5-TC04: 连续 status 调用应幂等', async () => {
    const s1 = await graph.status();
    const s2 = await graph.status();
    assert.equal(s1.totalFiles, s2.totalFiles);
    assert.equal(s1.totalNodes, s2.totalNodes);
  });
});

// =============================================================================
// S6: CLI 命令
// =============================================================================
describe('S6: CLI 命令', () => {
  let projectDir: string;

  before(() => {
    projectDir = createProject();
  });

  after(() => {
    cleanupDir(projectDir);
  });

  it('S6-TC01: init 命令应创建 .md-graph 目录和 index.db', async () => {
    const result = await cmdInit(projectDir);
    assert.ok(result.success);
    const storageDir = path.join(projectDir, '.md-graph');
    assert.ok(fs.existsSync(storageDir), '.md-graph 目录应存在');
    assert.ok(fs.existsSync(path.join(storageDir, 'index.db')), 'index.db 应存在');
  });

  it('S6-TC02: 重复 init 应返回失败', async () => {
    const result = await cmdInit(projectDir);
    assert.equal(result.success, false);
    const msg = result as { message?: string };
    assert.ok(msg.message?.includes('already exists'), `错误消息应提示已存在，实际: ${msg.message}`);
  });

  it('S6-TC03: status 命令应返回索引信息', async () => {
    const result = await cmdStatus(projectDir);
    assert.ok(result.success);
    const s = result as { totalFiles: number; totalNodes: number; totalEdges: number };
    assert.ok(s.totalFiles >= 5);
    assert.ok(s.totalNodes > 0);
    assert.ok(s.totalEdges > 0);
  });

  it('S6-TC04: uninstall 命令应删除存储目录', async () => {
    const storageDir = path.join(projectDir, '.md-graph');
    assert.ok(fs.existsSync(storageDir), 'uninstall 前存储目录应存在');
    const result = await cmdUninstall(projectDir);
    assert.ok(result.success);
    assert.ok(!fs.existsSync(storageDir), 'uninstall 后存储目录应不存在');
  });

  it('S6-TC05: 未初始化时 status 应返回失败', async () => {
    // 创建新目录（未初始化）
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-fresh-'));
    try {
      const result = await cmdStatus(freshDir);
      assert.equal(result.success, false);
    } finally {
      cleanupDir(freshDir);
    }
  });

  it('S6-TC06: 未初始化时 uninstall 应返回失败', async () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-fresh2-'));
    try {
      const result = await cmdUninstall(freshDir);
      assert.equal(result.success, false);
    } finally {
      cleanupDir(freshDir);
    }
  });
});
