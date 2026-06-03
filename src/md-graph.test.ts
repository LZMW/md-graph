// =============================================================================
// MdGraph — Facade TDD 测试
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let MdGraph: typeof import('./md-graph.js').MdGraph;

before(async () => {
  MdGraph = (await import('./md-graph.js')).MdGraph;
});

describe('MdGraph', () => {
  let tmpDir: string;
  let graph: InstanceType<typeof MdGraph>;

  // 创建一个简单的 .md 文件用于测试
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-facade-'));
    fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Hello\n\nThis is a test file.\n\n[link](other.md)');
    fs.writeFileSync(path.join(tmpDir, 'other.md'), '# Other\n\nAnother file.');
  });

  after(async () => {
    if (graph) {
      await graph.close();
    }
    // 多次重试删除，处理 Windows 文件锁
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  });

  it('constructor — 应使用 rootPath 创建 MdGraph 实例', async () => {
    graph = new MdGraph(tmpDir);
    assert.ok(graph instanceof MdGraph);
  });

  it('status — 应返回索引状态信息', async () => {
    const status = await graph.status();
    assert.ok(status !== undefined);
    assert.ok(typeof status.totalFiles === 'number');
    assert.ok(typeof status.totalNodes === 'number');
    assert.ok(typeof status.totalEdges === 'number');
  });

  it('search — 应返回搜索结果', async () => {
    const result = await graph.search('Hello');
    assert.ok(result !== undefined);
    assert.ok(Array.isArray(result.results));
  });

  it('navigate — 应返回导航结果', async () => {
    // 先索引，然后获取一个 nodeId
    await graph.status();

    // 通过搜索获取节点 ID
    const searchResult = await graph.search('Hello');
    if (searchResult.results.length > 0) {
      const nodeId = searchResult.results[0].id;
      const navResult = await graph.navigate(nodeId, 'outbound', 1);
      assert.ok(navResult !== undefined);
      assert.equal(navResult.sourceNodeId, nodeId);
      assert.equal(navResult.direction, 'outbound');
    }
  });

  it('navigate — 应支持三种方向', async () => {
    const searchResult = await graph.search('Hello');
    if (searchResult.results.length > 0) {
      const nodeId = searchResult.results[0].id;

      const outbound = await graph.navigate(nodeId, 'outbound', 1);
      assert.equal(outbound.direction, 'outbound');

      const inbound = await graph.navigate(nodeId, 'inbound', 1);
      assert.equal(inbound.direction, 'inbound');

      const impact = await graph.navigate(nodeId, 'impact', 1);
      assert.equal(impact.direction, 'impact');
    }
  });

  it('search — 空查询应返回空结果', async () => {
    const result = await graph.search('');
    assert.equal(result.totalResults, 0);
    assert.equal(result.results.length, 0);
  });
});
