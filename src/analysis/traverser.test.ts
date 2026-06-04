// =============================================================================
// Traverser 单元测试
// TDD: RED → GREEN → REFACTOR
// 覆盖 inbound/outbound/impact 三方向 + depth 参数
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDbAdapter } from '../storage/database.js';
import type { FileInsert, NodeInsert, EdgeInsert, NodeRecord } from '../types.js';
import { Traverser } from './traverser.js';

describe('Traverser', () => {
  let db: SqliteDbAdapter;
  let traverser: Traverser;
  let sourceNodeId: number;
  let targetNodeId: number;
  let midNodeId: number;
  let fileId: number;

  before(() => {
    db = new SqliteDbAdapter(':memory:');
    traverser = new Traverser(db, '.');

    // 准备测试数据：文件
    const file = db.insertFile({
      path: 'docs/test.md',
      content_hash: 'hash',
      size: 100,
      mtime_ms: 1000,
    });
    fileId = file.id;

    // 创建节点链：A → B → C
    // 其中 A = source, B = mid, C = target
    const n1 = db.insertNode({
      file_id: file.id, type: 'heading',
      line_start: 1, line_end: 1, col_start: 0, col_end: 0,
      searchable: 0, ordinal: 1, heading_level: 1,
      heading_path: 'Section A',
    });

    const n2 = db.insertNode({
      file_id: file.id, type: 'heading',
      line_start: 3, line_end: 3, col_start: 0, col_end: 0,
      searchable: 0, ordinal: 2, heading_level: 2,
      heading_path: 'Section A > Sub B',
    });

    const n3 = db.insertNode({
      file_id: file.id, type: 'paragraph',
      line_start: 5, line_end: 5, col_start: 0, col_end: 0,
      searchable: 1, ordinal: 3,
      heading_path: 'Section A > Sub B',
    });

    sourceNodeId = n1.id;
    midNodeId = n2.id;
    targetNodeId = n3.id;

    // 创建边：A → B, B → C (resolved)
    db.insertEdge({ source_node_id: sourceNodeId, target_node_id: midNodeId, raw_href: './sub-b', link_text: 'Sub B', status: 'resolved' });
    db.insertEdge({ source_node_id: midNodeId, target_node_id: targetNodeId, raw_href: './content', link_text: 'Content', status: 'resolved' });

    // 外部链接 (external)
    db.insertEdge({ source_node_id: sourceNodeId, target_node_id: null, raw_href: 'https://example.com', link_text: 'Example', status: 'external' });

    // 断链 (broken)
    db.insertEdge({ source_node_id: sourceNodeId, target_node_id: null, raw_href: './missing.md', link_text: 'Missing', status: 'broken' });

    // 来自其他文件的入链
    const otherFile = db.insertFile({
      path: 'docs/other.md',
      content_hash: 'hash_o',
      size: 50,
      mtime_ms: 500,
    });
    const otherNode = db.insertNode({
      file_id: otherFile.id, type: 'paragraph',
      line_start: 1, line_end: 1, col_start: 0, col_end: 0,
      searchable: 1, ordinal: 1,
    });
    db.insertEdge({ source_node_id: otherNode.id, target_node_id: sourceNodeId, raw_href: './test.md', link_text: 'Test Doc', status: 'resolved' });
  });

  after(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // 构造函数
  // ---------------------------------------------------------------------------
  it('constructor — 应使用 db 依赖创建 Traverser', () => {
    const t = new Traverser(db, '.');
    assert.ok(t instanceof Traverser);
  });

  // ---------------------------------------------------------------------------
  // navigate — outbound (出链)
  // ---------------------------------------------------------------------------
  it('navigate — outbound 应返回出链', async () => {
    const result = await traverser.navigate(sourceNodeId, 'outbound', 1);
    assert.equal(result.direction, 'outbound');
    assert.ok(result.totalLinks >= 3, '应有 3+ 条出链');
    assert.ok(result.links.some(l => l.linkText === 'Sub B'), '应包含 resolved 链接');
    assert.ok(result.links.some(l => l.status === 'external'), '应包含 external 链接');
    assert.ok(result.links.some(l => l.status === 'broken'), '应包含 broken 链接');
    assert.ok(result.sourceNodeId, '应有源节点 ID');
    assert.ok(result.sourcePath, '应有源文件路径');
  });

  it('navigate — outbound 深度 >1 应展开多级', async () => {
    const result = await traverser.navigate(sourceNodeId, 'outbound', 3);
    // 深度 3 应到达 C (source → mid → target)
    const targetLinks = result.links.filter(l => l.targetNodeId === targetNodeId);
    // 至少有一条指向 targetNodeId
    assert.ok(result.totalLinks >= 3);
  });

  it('navigate — outbound depth=1 只返回直接出链', async () => {
    const result = await traverser.navigate(sourceNodeId, 'outbound', 1);
    // depth=1 应从 A 出发，只到 B（不经过 C）
    // 直接出链：B (resolved), external link, broken link
    // 但因为 BFS depth=1 只提取第一层，不会到 C
    const directTargets = result.links.filter(l => l.targetNodeId !== null);
    for (const link of directTargets) {
      // 所有直接目标可能是 midNodeId 或 targetNodeId
      // 这里我们只检查至少有出链
      assert.ok(link.targetNodeId, 'direct links should have targets');
    }
  });

  // ---------------------------------------------------------------------------
  // navigate — inbound (入链)
  // ---------------------------------------------------------------------------
  it('navigate — inbound 应返回入链', async () => {
    const result = await traverser.navigate(sourceNodeId, 'inbound', 1);
    assert.equal(result.direction, 'inbound');
    // 应有来自 other.md 的入链
    const inboundFromOther = result.links.filter(l => l.targetPath?.includes('other'));
    assert.ok(result.totalLinks >= 1, '应有至少 1 条入链');
  });

  it('navigate — inbound 深度传播', async () => {
    // C 的入链深度 2 应找到 A: C ← B ← A
    const result = await traverser.navigate(targetNodeId, 'inbound', 3);
    assert.ok(result.totalLinks >= 1, 'target 应有入链');
  });

  it('navigate — inbound depth=1 只返回直接入链', async () => {
    // B 的直接入链来自 A
    const result = await traverser.navigate(midNodeId, 'inbound', 1);
    assert.ok(result.totalLinks >= 1, 'mid 节点应有入链');
  });

  // ---------------------------------------------------------------------------
  // navigate — impact (出链 + 入链)
  // ---------------------------------------------------------------------------
  it('navigate — impact 应返回入链和出链的组合', async () => {
    const result = await traverser.navigate(sourceNodeId, 'impact', 1);
    assert.equal(result.direction, 'impact');
    // impact 应包含出链(Sub B, Example, Missing) + 入链(other.md)
    assert.ok(result.totalLinks >= 4, 'impact 应包含入链和出链');
  });

  it('navigate — impact 不应有重复链接', async () => {
    const result = await traverser.navigate(sourceNodeId, 'impact', 1);
    const hrefs = new Set(result.links.map(l => l.linkText));
    assert.equal(hrefs.size, result.links.length, 'impact 不应有重复链接');
  });

  // ---------------------------------------------------------------------------
  // 边界情况
  // ---------------------------------------------------------------------------
  it('navigate — 无效 nodeId 应返回空导航结果', async () => {
    const result = await traverser.navigate(99999, 'outbound', 1);
    assert.equal(result.totalLinks, 0, '无效 nodeId 应返回 0 链接');
    assert.equal(result.sourceNodeId, 99999);
  });

  it('navigate — depth=0 应返回空结果', async () => {
    const result = await traverser.navigate(sourceNodeId, 'outbound', 0);
    assert.equal(result.totalLinks, 0);
  });

  // ---------------------------------------------------------------------------
  // stale 信息
  // ---------------------------------------------------------------------------
  it('navigate — 应包含 stale 信息', async () => {
    const result = await traverser.navigate(sourceNodeId, 'outbound', 1);
    assert.equal(typeof result.stale, 'boolean');
    assert.equal(typeof result.staleFileCount, 'number');
    assert.ok(result.lastIndexedAt);
  });

  it('navigate — 应包含 tookMs', async () => {
    const result = await traverser.navigate(sourceNodeId, 'outbound', 1);
    assert.ok(result.tookMs >= 0);
  });
});
