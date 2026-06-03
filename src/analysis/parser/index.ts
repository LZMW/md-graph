// =============================================================================
// ParserRegistry — 解析器注册表
// 维护文档格式到解析器的静态映射
// =============================================================================
import type { DocumentFormat, DocumentParser } from './base-parser.js';
import { MarkdownParser } from './md-parser.js';

// ---------------------------------------------------------------------------
// ParserRegistry
// ---------------------------------------------------------------------------
export class ParserRegistry {
  private static parsers = new Map<DocumentFormat, DocumentParser>();

  /** 注册解析器到指定格式（后注册覆盖先注册） */
  static register(format: DocumentFormat, parser: DocumentParser): void {
    ParserRegistry.parsers.set(format, parser);
  }

  /** 获取指定格式的解析器，未注册返回 undefined */
  static get(format: DocumentFormat): DocumentParser | undefined {
    return ParserRegistry.parsers.get(format);
  }

  /** 获取所有已注册格式的列表 */
  static getExtensions(): DocumentFormat[] {
    return Array.from(ParserRegistry.parsers.keys());
  }

  /** 清空注册表（测试用） */
  static clear(): void {
    ParserRegistry.parsers.clear();
  }
}

// ---------------------------------------------------------------------------
// 注册默认解析器
// ---------------------------------------------------------------------------
export function registerDefaultParsers(): void {
  ParserRegistry.register('md', new MarkdownParser());
}
