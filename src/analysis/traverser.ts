// =============================================================================
// Traverser — BFS 导航模块
// 提供 inbound/outbound/impact 三方向导航 + depth 参数
// 依赖: SqliteDbAdapter
// =============================================================================
import { SqliteDbAdapter } from '../storage/database.js';
import type { NavResult, NavLink, Direction, NodeRecord } from '../types.js';

// =============================================================================
// 安全保护常量
// =============================================================================
const MAX_VISITED = 2000;
const MAX_DEPTH = 30;

// =============================================================================
// Traverser
// =============================================================================
export class Traverser {
  constructor(private readonly db: SqliteDbAdapter) {}

  // =========================================================================
  // navigate — BFS 导航
  // =========================================================================
  async navigate(
    nodeId: number,
    direction: Direction,
    depth: number = 1,
  ): Promise<NavResult> {
    const startTime = Date.now();
    const safeDepth = Math.min(depth, MAX_DEPTH);

    // 检查节点是否存在
    const sourceNode = this.db.getNodeById(nodeId);

    if (!sourceNode) {
      // 节点不存在，返回空结果
      const staleInfo = this.db.getStaleInfo();
      return {
        sourceNodeId: nodeId,
        sourceFileId: 0,
        sourcePath: '',
        sourceFileName: '',
        topic: '',
        direction,
        depth: safeDepth,
        totalLinks: 0,
        links: [],
        stale: staleInfo.stale,
        staleFileCount: staleInfo.staleFileCount,
        lastIndexedAt: staleInfo.lastIndexedAt,
        tookMs: Date.now() - startTime,
      };
    }

    // 构建结果基本信息
    const sourceFile = this.db.getAllFiles().find(f => f.id === sourceNode.file_id);
    const sourcePath = sourceFile?.path || '';
    const sourceFileName = this.extractFileName(sourcePath);

    // 获取文件内文本内容作为 topic
    const content = this.db.getContent(nodeId);
    const topic = sourceNode.heading_path || content?.slice(0, 100) || sourceFileName;

    let links: NavLink[] = [];
    let truncated = false;

    if (direction === 'outbound') {
      const result = await this.navigateOutbound(nodeId, safeDepth);
      links = result.links;
      truncated = result.truncated;
    } else if (direction === 'inbound') {
      const result = await this.navigateInbound(nodeId, safeDepth);
      links = result.links;
      truncated = result.truncated;
    } else if (direction === 'impact') {
      const result = await this.navigateImpact(nodeId, safeDepth);
      links = result.links;
      truncated = result.truncated;
    }

    const staleInfo = this.db.getStaleInfo();

    return {
      sourceNodeId: nodeId,
      sourceFileId: sourceNode.file_id,
      sourcePath,
      sourceFileName,
      topic,
      direction,
      depth: safeDepth,
      totalLinks: links.length,
      links,
      truncated: truncated || undefined,
      stale: staleInfo.stale,
      staleFileCount: staleInfo.staleFileCount,
      lastIndexedAt: staleInfo.lastIndexedAt,
      tookMs: Date.now() - startTime,
    };
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** BFS 出链导航 */
  private async navigateOutbound(
    nodeId: number,
    maxDepth: number,
  ): Promise<{ links: NavLink[]; truncated: boolean }> {
    const edges = this.db.getBFSOutbound([nodeId], maxDepth);
    if (edges.length > MAX_VISITED) {
      return {
        links: this.edgesToNavLinks(edges.slice(0, MAX_VISITED)),
        truncated: true,
      };
    }
    return { links: this.edgesToNavLinks(edges), truncated: false };
  }

  /** BFS 入链导航 */
  private async navigateInbound(
    nodeId: number,
    maxDepth: number,
  ): Promise<{ links: NavLink[]; truncated: boolean }> {
    const edges = this.db.getBFSInbound([nodeId], maxDepth);
    if (edges.length > MAX_VISITED) {
      return {
        links: this.edgesToNavLinks(edges.slice(0, MAX_VISITED)),
        truncated: true,
      };
    }
    return { links: this.edgesToNavLinks(edges), truncated: false };
  }

  /** Impact 导航 = inbound + outbound 合并去重 */
  private async navigateImpact(
    nodeId: number,
    maxDepth: number,
  ): Promise<{ links: NavLink[]; truncated: boolean }> {
    const outboundResult = await this.navigateOutbound(nodeId, maxDepth);
    const inboundResult = await this.navigateInbound(nodeId, maxDepth);

    // 合并去重
    const seen = new Set<string>();
    const combined: NavLink[] = [];

    for (const link of [...outboundResult.links, ...inboundResult.links]) {
      const key = `${link.linkText}|${link.targetPath}|${link.status}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(link);
      }
    }

    return {
      links: combined,
      truncated: outboundResult.truncated || inboundResult.truncated,
    };
  }

  /** 将 EdgeRecord 转为 NavLink[] */
  private edgesToNavLinks(
    edges: Array<{
      id: number;
      source_node_id: number;
      target_node_id: number | null;
      raw_href: string;
      link_text: string | null;
      line: number | null;
      col: number | null;
      status: string;
    }>,
  ): NavLink[] {
    // 分离出边和入边用于查询源节点和目标节点的文件信息
    const sourceNodeIds = new Set<number>();
    const targetNodeIds = new Set<number>();

    for (const e of edges) {
      sourceNodeIds.add(e.source_node_id);
      if (e.target_node_id !== null) {
        targetNodeIds.add(e.target_node_id);
      }
    }

    // 预加载所有源节点和目标节点
    const sourceNodes = new Map<number, NodeRecord>();
    const targetNodes = new Map<number, NodeRecord>();

    for (const sid of sourceNodeIds) {
      const node = this.db.getNodeById(sid);
      if (node) sourceNodes.set(sid, node);
    }
    for (const tid of targetNodeIds) {
      const node = this.db.getNodeById(tid);
      if (node) targetNodes.set(tid, node);
    }

    // 预加载所有涉及的文件
    const fileIds = new Set<number>();
    for (const node of sourceNodes.values()) fileIds.add(node.file_id);
    for (const node of targetNodes.values()) fileIds.add(node.file_id);

    const allFiles = this.db.getAllFiles();
    const fileMap = new Map(allFiles.map(f => [f.id, f]));

    const links: NavLink[] = [];

    for (const edge of edges) {
      const srcNode = sourceNodes.get(edge.source_node_id);
      const tgtNode = edge.target_node_id !== null ? targetNodes.get(edge.target_node_id) : null;

      const srcFile = srcNode ? fileMap.get(srcNode.file_id) : null;
      const tgtFile = tgtNode ? fileMap.get(tgtNode.file_id) : null;

      // 计算源节点的 lineRanges
      const sourceLineRanges = srcNode
        ? `${srcNode.line_start}-${srcNode.line_end}`
        : '';

      // 目标节点信息
      const targetNodeId = edge.target_node_id ?? null;
      const targetFileId = tgtNode?.file_id ?? null;
      const targetPath = tgtFile?.path || edge.raw_href;
      const targetFileName = tgtFile
        ? this.extractFileName(tgtFile.path)
        : this.extractFileName(edge.raw_href);

      // 目标 topic（heading_path 或内容片段）
      let targetTopic = '';
      if (tgtNode) {
        targetTopic = tgtNode.heading_path || '';
        if (!targetTopic && tgtNode.id) {
          const tgtContent = this.db.getContent(tgtNode.id);
          targetTopic = tgtContent ? tgtContent.slice(0, 100) : '';
        }
      }

      links.push({
        sourceLineRanges,
        linkText: edge.link_text || '',
        targetNodeId,
        targetFileId,
        targetPath,
        targetFileName,
        targetTopic,
        status: edge.status as 'resolved' | 'broken' | 'external',
      });
    }

    return links;
  }

  /** 从路径中提取文件名 */
  private extractFileName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }
}
