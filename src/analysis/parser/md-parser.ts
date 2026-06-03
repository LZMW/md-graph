// =============================================================================
// MarkdownParser — markdown-it + DocIR 适配层
// 将 markdown-it token 流映射为 7 类 DocNode + 链接提取 + parent_id 层级
// =============================================================================
import MarkdownIt from 'markdown-it';
import crypto from 'node:crypto';
import type Token from 'markdown-it/lib/token.mjs';
import type { DocNode, ExtractedLink, ParsedDocument } from '../../types.js';
import type { DocumentParser, DocumentFormat } from './base-parser.js';

// ---------------------------------------------------------------------------
// 内部状态
// ---------------------------------------------------------------------------
interface HeadingEntry {
  nodeId: number;
  level: number;
  /** Pure text content of the heading */
  text: string;
}

interface ParseState {
  nodes: DocNode[];
  edges: ExtractedLink[];
  headings: HeadingEntry[];
  nextNodeId: number;
  /** Map from parent node id -> next ordinal */
  ordinals: Map<number, number>;
  filePath: string;
}

// ---------------------------------------------------------------------------
// MarkdownParser
// ---------------------------------------------------------------------------
export class MarkdownParser implements DocumentParser {
  readonly supportedFormat: DocumentFormat = 'md';
  readonly unsuitableFor?: string[] = ['.mdx 不支持 JSX 组件内嵌语法'];

  private md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt({ html: true, linkify: true });
  }

  // =========================================================================
  // parse — 主入口
  // =========================================================================
  parse(content: string, filePath?: string): ParsedDocument {
    const tokens = this.md.parse(content, {});
    const state: ParseState = {
      nodes: [],
      edges: [],
      headings: [],
      nextNodeId: 1,
      ordinals: new Map(),
      filePath: filePath || '',
    };

    // 遍历 token 流
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      switch (token.type) {
        case 'heading_open':
          i = this.handleHeading(token, tokens, i, state);
          break;
        case 'paragraph_open':
          i = this.handleParagraph(token, tokens, i, state);
          break;
        case 'inline':
          // 独立的 inline token（未被 heading/paragraph 覆盖）
          i = this.handleInline(token, state, i);
          break;
        case 'fence':
          i = this.handleFence(token, state, i);
          break;
        case 'list_item_open':
          i = this.handleListItem(token, tokens, i, state);
          break;
        case 'blockquote_open':
          i = this.handleBlockquote(token, state, i);
          break;
        case 'tr_open':
          i = this.handleTableRow(token, tokens, i, state);
          break;
        default:
          // 跳过其他 token 类型（heading_close, paragraph_close,
          // list_item_close, bullet_list_open/close, ordered_list_open/close,
          // blockquote_close, table_open/close, th_open, td_open, hr 等）
          i++;
          break;
      }
    }

    // 创建 document 根节点
    this.createDocumentNode(state);

    // contentHash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // metadata
    const headingNodes = state.nodes.filter(n => n.type === 'heading');
    const codeNodes = state.nodes.filter(n => n.type === 'code_block');
    const metadata: ParsedDocument['metadata'] = {
      title: headingNodes.length > 0 && headingNodes[0].content
        ? headingNodes[0].content : undefined,
      headings: headingNodes.map(h => ({
        level: h.headingLevel ?? 1,
        text: h.content ?? '',
        lineStart: h.lineStart,
      })),
      codeBlocks: codeNodes.map(c => ({
        language: c.content
          ? undefined // 语言信息已丢失，md-parser 不单独存储语言到 DocNode
          : undefined,
        content: c.content ?? '',
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
      })),
    };

    return { nodes: state.nodes, edges: state.edges, metadata, contentHash };
  }

  // =========================================================================
  // 处理器
  // =========================================================================

  /** heading_open → inline → heading_close */
  private handleHeading(
    token: Token, tokens: Token[], i: number, state: ParseState,
  ): number {
    const level = parseInt(token.tag[1], 10); // 'h1' -> 1, 'h2' -> 2
    const inlineToken = tokens[i + 1];
    const text = this.extractInlineText(inlineToken);
    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = inlineToken.map ? inlineToken.map[1] : lineStart;

    // 更新 heading stack：弹出 level >= 当前 level 的 heading
    while (
      state.headings.length > 0
      && state.headings[state.headings.length - 1].level >= level
    ) {
      state.headings.pop();
    }

    // 构建 headingPath
    const headingPath = state.headings.length > 0
      ? [...state.headings.map(h => h.text), text].join(' > ')
      : text;

    // 确定 parentId
    const parentId = state.headings.length > 0
      ? state.headings[state.headings.length - 1].nodeId
      : 0; // 0 = document node (will be created later)

    // 创建 heading 节点
    const node = this.makeNode('heading', {
      lineStart, lineEnd, state, parentId, content: text,
    });
    node.headingLevel = level;
    node.headingPath = headingPath;
    state.nodes.push(node);

    // 推入 heading stack
    state.headings.push({ nodeId: node.id!, level, text });

    // 跳过 inline 和 heading_close
    return i + 3;
  }

  /** paragraph_open → inline → paragraph_close */
  private handleParagraph(
    token: Token, tokens: Token[], i: number, state: ParseState,
  ): number {
    const inlineToken = tokens[i + 1];
    const text = this.extractInlineText(inlineToken);
    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = inlineToken.map ? inlineToken.map[1] : lineStart;

    // 提取链接
    const links = this.extractLinks(inlineToken, lineStart);

    // 创建 paragraph 节点
    const parentId = this.currentParentId(state);
    const node = this.makeNode('paragraph', {
      lineStart, lineEnd, state, parentId, content: text,
    });
    if (links.length > 0) node.links = links;
    state.nodes.push(node);
    state.edges.push(...links);

    return i + 3;
  }

  /** 独立的 inline token（如在列表项内） */
  private handleInline(
    token: Token, state: ParseState, i: number,
  ): number {
    // 只在非 heading/paragraph 上下文中处理 inline
    // （heading 和 paragraph 已经在对应的处理器中处理了 inline）
    const text = this.extractInlineText(token);
    if (!text) return i + 1;

    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = token.map ? token.map[1] : lineStart;
    const links = this.extractLinks(token, lineStart);
    const parentId = this.currentParentId(state);

    const node = this.makeNode('paragraph', {
      lineStart, lineEnd, state, parentId, content: text,
    });
    if (links.length > 0) node.links = links;
    state.nodes.push(node);
    state.edges.push(...links);

    return i + 1;
  }

  /** fence — 代码块 */
  private handleFence(
    token: Token, state: ParseState, i: number,
  ): number {
    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = token.map ? token.map[1] : lineStart;
    const parentId = this.currentParentId(state);
    const codeContent = token.content;
    const language = token.info || undefined;

    const content = language
      ? `\`\`\`${language}\n${codeContent}\n\`\`\``
      : codeContent;

    const node = this.makeNode('code_block', {
      lineStart, lineEnd, state, parentId, content,
    });
    state.nodes.push(node);
    return i + 1;
  }

  /** list_item_open — 列表项 */
  private handleListItem(
    token: Token, tokens: Token[], i: number, state: ParseState,
  ): number {
    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = token.map ? token.map[1] : lineStart;
    const parentId = this.currentParentId(state);

    // 查找列表项内的第一个 inline token 获取文本内容
    let text = '';
    let j = i + 1;
    while (j < tokens.length && tokens[j].type !== 'list_item_close') {
      if (tokens[j].type === 'inline') {
        text = this.extractInlineText(tokens[j]);
        break;
      }
      j++;
    }

    const node = this.makeNode('list_item', {
      lineStart, lineEnd, state, parentId, content: text || undefined,
    });
    state.nodes.push(node);

    // 跳到 list_item_close
    while (i < tokens.length && tokens[i].type !== 'list_item_close') {
      i++;
    }
    return i + 1;
  }

  /** blockquote_open — 块引用 */
  private handleBlockquote(
    token: Token, state: ParseState, i: number,
  ): number {
    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = token.map ? token.map[1] : lineStart;
    const parentId = this.currentParentId(state);

    const node = this.makeNode('blockquote', {
      lineStart, lineEnd, state, parentId,
    });
    state.nodes.push(node);
    return i + 1;
  }

  /** tr_open — 表格行 */
  private handleTableRow(
    token: Token, tokens: Token[], i: number, state: ParseState,
  ): number {
    const lineStart = token.map ? token.map[0] + 1 : 0;
    const lineEnd = token.map ? token.map[1] : lineStart;
    const parentId = this.currentParentId(state);

    const node = this.makeNode('table_row', {
      lineStart, lineEnd, state, parentId,
    });
    state.nodes.push(node);

    // 跳到 tr_close
    while (i < tokens.length && tokens[i].type !== 'tr_close') {
      i++;
    }
    return i + 1;
  }

  // =========================================================================
  // 辅助方法
  // =========================================================================

  /** 创建 DocNode 并分配 id 和 ordinal */
  private makeNode(
    type: DocNode['type'],
    opts: {
      lineStart: number; lineEnd: number; state: ParseState;
      parentId: number; content?: string;
    },
  ): DocNode {
    const id = opts.state.nextNodeId++;
    const ordinal = this.nextOrdinal(opts.state, opts.parentId);

    return {
      id,
      type,
      filePath: opts.state.filePath,
      lineStart: opts.lineStart,
      lineEnd: opts.lineEnd,
      colStart: 0,
      colEnd: 0,
      searchable: type === 'heading' || type === 'paragraph'
        || type === 'list_item' || type === 'code_block',
      ordinal,
      parentId: opts.parentId,
      content: opts.content,
    };
  }

  /** 获取当前上下文的 parentId（最近 heading 或 0=document） */
  private currentParentId(state: ParseState): number {
    return state.headings.length > 0
      ? state.headings[state.headings.length - 1].nodeId
      : 0;
  }

  /** 获取下一个 ordinal 值 */
  private nextOrdinal(state: ParseState, parentId: number): number {
    const current = state.ordinals.get(parentId) ?? 0;
    state.ordinals.set(parentId, current + 1);
    return current + 1;
  }

  /** 创建 document 根节点 */
  private createDocumentNode(state: ParseState): void {
    // 计算 document 的 lineStart/lineEnd 和 ordinals
    if (state.nodes.length === 0) {
      // 无节点时创建空文档节点
      state.nodes.unshift({
        id: state.nextNodeId++,
        type: 'document',
        filePath: state.filePath,
        lineStart: 1,
        lineEnd: 1,
        colStart: 0,
        colEnd: 0,
        searchable: false,
        ordinal: 1,
        parentId: undefined,
      });
      return;
    }

    // 计算文档跨度
    let minLine = Infinity;
    let maxLine = -Infinity;
    for (const n of state.nodes) {
      if (n.lineStart < minLine) minLine = n.lineStart;
      if (n.lineEnd > maxLine) maxLine = n.lineEnd;
    }

    const docNode: DocNode = {
      id: 0, // 固定 id=0 作为文档根
      type: 'document',
      filePath: state.filePath,
      lineStart: minLine,
      lineEnd: maxLine,
      colStart: 0,
      colEnd: 0,
      searchable: false,
      ordinal: 1,
      parentId: undefined,
    };

    state.nodes.unshift(docNode);

    // 将 parentId=0 的节点重新指向 document 的 id
    for (const n of state.nodes) {
      if (n.type !== 'document' && n.parentId === 0) {
        n.parentId = docNode.id;
      }
    }

    // 更新 headings stack 中的 nodeId 引用（如果存在 parentId=0）
    for (const h of state.headings) {
      if (h.nodeId === 0) h.nodeId = 0;
    }
  }

  /** 从 inline token 提取纯文本 */
  private extractInlineText(token: Token): string {
    if (!token || token.type !== 'inline') return '';
    return token.content || '';
  }

  /** 从 inline token 的 children 中提取链接 */
  private extractLinks(token: Token, line: number): ExtractedLink[] {
    if (!token.children || token.children.length === 0) return [];

    const links: ExtractedLink[] = [];

    for (const child of token.children) {
      if (child.type === 'link_open') {
        const href = this.getAttr(child, 'href') || '';
        const linkType = this.classifyHref(href);

        // 提取 link text: 收集 link_open 和 link_close 之间的文本
        let linkText = '';
        // 查找 link text 来自 token.content（或在 children 中收集中间 text 节点）
        // 对于 markdown-it, link_open 的下一子节点通常是 text 类型
        // 但因为我们在这里遍历 children 列表，text 节点可能在 link_open 后面
        // 其实我们可以在 link_open 之后收集 text 类型 children 直到 link_close
        // 但这里简化处理：使用 token 本身的 content 属性不够准确，
        // 因为 token.content 是整个 inline 的内容

        // 更准确的做法：遍历整个 children 找到 link_open/link_close 对
        // 但由于我们是一次遍历，先收集 link_open，再在遇到 link_close 前
        // 收集 text 节点

        // 对于简单场景，先记下 link_open，后续遇到 text 节点时关联
        // 但我们用更简单的方法：在当前 link_open 后立刻查找下一个 text 或 link_close
        // 使用 content 场景
        links.push({
          rawHref: href,
          linkText: '', // 将在后续的 link_close 逻辑中填充
          line,
          col: 0,
          type: linkType,
        });
      }
    }

    // 重试：更准确的链接提取
    // 扫描 children 寻找 link_open/link_close 对
    return this.extractLinksAccurate(token, line);
  }

  /** 准确的链接提取：遍历 children，配对 link_open/link_close */
  private extractLinksAccurate(token: Token, line: number): ExtractedLink[] {
    if (!token.children || token.children.length === 0) return [];

    const links: ExtractedLink[] = [];
    let i = 0;

    while (i < token.children.length) {
      const child = token.children[i];

      if (child.type === 'link_open') {
        const href = this.getAttr(child, 'href') || '';
        const linkType = this.classifyHref(href);

        // 收集 link text
        let linkText = '';
        let j = i + 1;
        while (j < token.children.length && token.children[j].type !== 'link_close') {
          if (token.children[j].type === 'text') {
            linkText += token.children[j].content;
          }
          j++;
        }

        links.push({
          rawHref: href,
          linkText,
          line,
          col: 0,
          type: linkType,
        });

        i = j; // 跳到 link_close 之后
      } else {
        i++;
      }
    }

    return links;
  }

  /** 获取 token 属性 */
  private getAttr(token: Token, name: string): string | undefined {
    if (!token.attrs) return undefined;
    for (const [key, value] of token.attrs) {
      if (key === name) return value;
    }
    return undefined;
  }

  /** 对 href 进行分类 */
  private classifyHref(href: string): 'internal' | 'external' | 'anchor' {
    if (href.startsWith('#')) return 'anchor';
    if (href.startsWith('http://') || href.startsWith('https://')) return 'external';
    return 'internal';
  }
}
