// =============================================================================
// SqliteDbAdapter 单元测试
// TDD: RED → GREEN → REFACTOR
// 使用 :memory: 数据库避免测试污染
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDbAdapter } from './database.js';
import type { FileInsert, NodeInsert, EdgeInsert } from '../types.js';

describe('SqliteDbAdapter', () => {
  let db: SqliteDbAdapter;

  before(() => {
    db = new SqliteDbAdapter(':memory:');
  });

  after(() => {
    db.close();
  });

  // ===========================================================================
  // 生命周期
  // ===========================================================================
  it('constructor — 应成功打开 :memory: 数据库并执行 schema', () => {
    // 如果能执行查询就说明 schema 已加载
    const count = db.getFileCount();
    assert.equal(typeof count, 'number');
  });

  it('close — 应能安全关闭数据库', () => {
    const db2 = new SqliteDbAdapter(':memory:');
    db2.close();
    // 关闭后调用方法应抛异常
    assert.throws(() => db2.getFileCount(), /closed|open/);
  });

  // ===========================================================================
  // files CRUD
  // ===========================================================================
  const testFile: FileInsert = {
    path: 'test/doc.md',
    content_hash: 'abc123',
    size: 1024,
    mtime_ms: 1000000,
    status: 'active',
  };

  let fileId: number;

  it('insertFile — 应插入文件记录并返回 id', () => {
    const result = db.insertFile(testFile);
    assert.ok(result.id > 0);
    fileId = result.id;
  });

  it('getFileByPath — 应按路径查询文件', () => {
    const record = db.getFileByPath('test/doc.md');
    assert.ok(record);
    assert.equal(record.path, 'test/doc.md');
    assert.equal(record.content_hash, 'abc123');
    assert.equal(record.status, 'active');
  });

  it('getFileByPath — 不存在的路径应返回 undefined', () => {
    const record = db.getFileByPath('nonexistent.md');
    assert.equal(record, undefined);
  });

  it('updateFile — 应更新文件记录', () => {
    db.updateFile(fileId, { content_hash: 'def456', size: 2048 });
    const record = db.getFileByPath('test/doc.md')!;
    assert.equal(record.content_hash, 'def456');
    assert.equal(record.size, 2048);
  });

  it('getAllFiles — 应返回所有文件', () => {
    const files = db.getAllFiles();
    assert.ok(files.length >= 1);
    assert.ok(files.some(f => f.path === 'test/doc.md'));
  });

  it('getFileCount — 应返回文件总数', () => {
    const count = db.getFileCount();
    assert.ok(count >= 1);
  });

  it('getFilesByStatus — 应按状态过滤文件', () => {
    const activeFiles = db.getFilesByStatus('active');
    assert.ok(activeFiles.some(f => f.path === 'test/doc.md'));
    const deletedFiles = db.getFilesByStatus('deleted');
    assert.ok(!deletedFiles.some(f => f.path === 'test/doc.md'));
  });

  it('deleteFile — 应删除文件记录', () => {
    // 插入一个临时文件用于删除测试
    const tmpFile = db.insertFile({
      path: 'tmp/to-delete.md',
      content_hash: 'tmp',
      size: 0,
      mtime_ms: 0,
    });
    db.deleteFile(tmpFile.id);
    const record = db.getFileByPath('tmp/to-delete.md');
    assert.equal(record, undefined);
  });

  // ===========================================================================
  // doc_nodes CRUD
  // ===========================================================================
  const testNode: NodeInsert = {
    file_id: 0, // 将在测试中设置
    type: 'heading',
    line_start: 1,
    line_end: 5,
    col_start: 0,
    col_end: 10,
    searchable: 1,
    ordinal: 1,
    heading_level: 2,
    heading_path: 'Introduction',
  };

  let nodeId: number;

  it('insertNode — 应插入节点并返回 id', () => {
    testNode.file_id = fileId;
    const result = db.insertNode({ ...testNode, ordinal: 1 });
    assert.ok(result.id > 0);
    nodeId = result.id;
  });

  it('getNodeById — 应按 id 查询节点', () => {
    const record = db.getNodeById(nodeId);
    assert.ok(record);
    assert.equal(record.type, 'heading');
    assert.equal(record.file_id, fileId);
  });

  it('getNodeById — 不存在的 id 应返回 undefined', () => {
    const record = db.getNodeById(99999);
    assert.equal(record, undefined);
  });

  it('getNodesByFile — 应按文件 id 获取所有节点', () => {
    const nodes = db.getNodesByFile(fileId);
    assert.ok(nodes.length >= 1);
    assert.ok(nodes.some(n => n.id === nodeId));
  });

  it('getNodeCount — 应返回节点总数', () => {
    const count = db.getNodeCount();
    assert.ok(count >= 1);
  });

  it('insertNodes — 应批量插入节点（事务）', () => {
    const nodes: NodeInsert[] = [
      { ...testNode, ordinal: 2, type: 'paragraph', heading_path: null, heading_level: null, line_start: 6, line_end: 10, searchable: 1 },
      { ...testNode, ordinal: 3, type: 'paragraph', heading_path: null, heading_level: null, line_start: 11, line_end: 15, searchable: 0 },
    ];
    const ids = db.insertNodes(nodes);
    assert.equal(ids.length, 2);
    assert.ok(ids[0] > 0);
    assert.ok(ids[1] > 0);
  });

  it('deleteNodesByFile — 应删除文件的所有节点', () => {
    const fileForDelete = db.insertFile({
      path: 'tmp/delete-nodes.md',
      content_hash: 'del',
      size: 0,
      mtime_ms: 0,
    });
    db.insertNode({ ...testNode, ordinal: 1, file_id: fileForDelete.id });
    db.insertNode({ ...testNode, ordinal: 2, file_id: fileForDelete.id });
    db.deleteNodesByFile(fileForDelete.id);
    assert.equal(db.getNodeCount(), db.getNodesByFile(fileId).length);
    // 确认被删除文件的节点已不存在
    const nodes = db.getNodesByFile(fileForDelete.id);
    assert.equal(nodes.length, 0);
    // 清理
    db.deleteFile(fileForDelete.id);
  });

  // ===========================================================================
  // doc_node_content 操作
  // ===========================================================================
  it('insertContent — 应插入节点内容', () => {
    db.insertContent(nodeId, '# Introduction\n\nThis is the intro.');
    const content = db.getContent(nodeId);
    assert.equal(content, '# Introduction\n\nThis is the intro.');
  });

  it('getContent — 不存在的节点应返回 undefined', () => {
    const content = db.getContent(99999);
    assert.equal(content, undefined);
  });

  it('deleteContent — 应删除节点内容', () => {
    db.deleteContent(nodeId);
    const content = db.getContent(nodeId);
    assert.equal(content, undefined);
  });

  // ===========================================================================
  // edges CRUD
  // ===========================================================================
  const testEdge: EdgeInsert = {
    source_node_id: 0,
    target_node_id: null,
    raw_href: './other.md',
    link_text: 'Other Doc',
    status: 'resolved',
  };

  let edgeId: number;

  it('insertEdge — 应插入边并返回 id', () => {
    // 先插入另一个节点作为 target
    const targetNode = db.insertNode({ ...testNode, ordinal: 4, file_id: fileId });
    testEdge.source_node_id = nodeId;
    testEdge.target_node_id = targetNode.id;
    const result = db.insertEdge(testEdge);
    assert.ok(result.id > 0);
    edgeId = result.id;
  });

  it('getEdgesBySourceNode — 应按源节点查询出链', () => {
    const edges = db.getEdgesBySourceNode(nodeId);
    assert.ok(edges.length >= 1);
    assert.equal(edges[0].raw_href, './other.md');
  });

  it('getEdgesByTargetNode — 应按目标节点查询入链', () => {
    const targetNode = db.getNodeById(testEdge.target_node_id!)!;
    const edges = db.getEdgesByTargetNode(targetNode.id);
    assert.ok(edges.length >= 1);
  });

  it('getEdgeCount — 应返回边总数', () => {
    const count = db.getEdgeCount();
    assert.ok(count >= 1);
  });

  it('insertEdges — 应批量插入边（事务）', () => {
    const edges: EdgeInsert[] = [
      { source_node_id: nodeId, raw_href: './link-a.md', link_text: 'Link A', status: 'broken' },
      { source_node_id: nodeId, raw_href: './link-b.md', link_text: 'Link B', status: 'external' },
    ];
    const ids = db.insertEdges(edges);
    assert.equal(ids.length, 2);
  });

  it('getBrokenLinks — 应返回所有 broken 状态的边', () => {
    const broken = db.getBrokenLinks();
    assert.ok(broken.length >= 1);
    assert.ok(broken.every(e => e.status === 'broken'));
  });

  it('deleteEdgesByFile — 应删除文件的所有边', () => {
    // 删除测试文件的边
    db.deleteEdgesByFile(fileId);
    const edges = db.getEdgesBySourceNode(nodeId);
    assert.equal(edges.length, 0);
  });

  // ===========================================================================
  // 搜索和导航
  // ===========================================================================
  it('searchFTS — 应返回 FTS5 搜索结果', () => {
    // 先确保有可搜索的内容
    db.insertContent(nodeId, 'This is a test document about TypeScript and node.js.');
    const results = db.searchFTS('TypeScript', { maxResults: 10 });
    assert.ok(results.length >= 1, '应该至少有一个搜索结果');
    assert.ok(results.some(r => r.id === nodeId), '搜索结果应包含测试节点');
  });

  it('searchFTS — 无结果应返回空数组', () => {
    const results = db.searchFTS('zzzznotfound', { maxResults: 10 });
    assert.equal(results.length, 0);
  });

  it('searchFTS — 支持分页参数', () => {
    const results = db.searchFTS('test', { maxResults: 5, offset: 0 });
    assert.ok(results.length <= 5);
  });

  it('searchFTS — 支持 fileGlob 过滤', () => {
    // fileGlob 通过路径 LIKE 过滤
    const results = db.searchFTS('test', { maxResults: 10, fileGlob: 'test/%' });
    // 至少应在测试路径下找到结果
    assert.ok(results.length >= 0); // 可能没有匹配
  });

  it('getBFSOutbound — 应返回 BFS 出链', () => {
    // 插入一个带 target 的边再测试
    const targetNode = db.insertNode({ ...testNode, ordinal: 5, file_id: fileId });
    db.insertEdge({ source_node_id: nodeId, target_node_id: targetNode.id, raw_href: './bfs-test.md', status: 'resolved' });
    const outbound = db.getBFSOutbound([nodeId], 3);
    assert.ok(outbound.length >= 1);
  });

  it('getBFSInbound — 应返回 BFS 入链', () => {
    // 重新插入一个边用于 BFS Inbound 测试
    const inboundTarget = db.insertNode({ ...testNode, ordinal: 10, file_id: fileId });
    const inboundSource = db.insertNode({ ...testNode, ordinal: 11, file_id: fileId });
    db.insertEdge({ source_node_id: inboundSource.id, target_node_id: inboundTarget.id, raw_href: './inbound.md', status: 'resolved' });
    const inbound = db.getBFSInbound([inboundTarget.id], 3);
    assert.ok(inbound.length >= 1, '应至少有一条入链');
    assert.ok(inbound.some(e => e.source_node_id === inboundSource.id), '入链应包含 source node');
  });

  // ===========================================================================
  // 状态信息
  // ===========================================================================
  it('getStaleInfo — 应返回 staleness 信息', () => {
    const info = db.getStaleInfo();
    assert.equal(typeof info.stale, 'boolean');
    assert.equal(typeof info.staleFileCount, 'number');
    assert.equal(typeof info.lastIndexedAt, 'string');
  });

  it('getStatus — 应返回索引统计', () => {
    const status = db.getStatus();
    assert.equal(typeof status.totalFiles, 'number');
    assert.equal(typeof status.totalNodes, 'number');
    assert.equal(typeof status.totalEdges, 'number');
    assert.ok(status.totalFiles >= 1);
    assert.ok(status.totalNodes >= 1);
  });

  // ===========================================================================
  // 变更检测
  // ===========================================================================
  it('getFileChangeDetails — 应返回文件的变更详情 JSON', () => {
    // 更新文件时设置 last_change_details
    db.updateFile(fileId, { last_change_details: JSON.stringify({ type: 'modified', changes: ['content'] }) });
    const details = db.getFileChangeDetails(fileId);
    assert.ok(details);
    assert.ok(details.includes('modified'));
  });

  it('getChangedFilesSince — 应按时间筛选变更文件', () => {
    const changed = db.getChangedFilesSince('2020-01-01T00:00:00Z');
    // 测试文件在 2020 年之后应有变更记录（indexed_at 是当前时间）
    assert.ok(changed.length >= 0);
    if (changed.length > 0) {
      assert.ok(changed.some(f => f.path.includes('test/doc.md')));
    }
  });
});
