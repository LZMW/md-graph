// =============================================================================
// TemplateEngine — 自然语言模板引擎
// 按 DI 规格（architecture-spec/06-mcp-cli-interface.md gen-3）输出
// 裁决 #11: 空结果自然语言文本
// ADR-012: _next 【务必】/【不要】引导格式
// 裁决 #6: staleness 三字段嵌入每个响应末尾
// =============================================================================

// =============================================================================
// extractKeywordsFromFiles — 从变更文件的 headingPath 提取关键词
// =============================================================================
function extractKeywordsFromFiles(files: Array<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const f of files) {
    const hp = (f['headingPath'] as string) ?? '';
    // headingPath 格式: "公共前缀 > 子节点1(+N), 子节点2"
    const parts = hp.split(' > ');
    const lastPart = parts[parts.length - 1] || hp;
    for (const segment of lastPart.split(', ')) {
      let name = segment.replace(/\s*\(\+?\d+\)\s*/g, '').trim();
      // 截断过长的标题名（>20 字符），取有意义的前面部分
      if (name.length > 20) {
        const sep = name.indexOf(' — ');
        name = sep > 0 ? name.slice(0, sep) : name.slice(0, 18) + '…';
      }
      if (name && name.length > 1 && !name.startsWith('…')) {
        if (!seen.has(name)) {
          seen.add(name);
          keywords.push(name);
        }
      }
    }
    if (keywords.length >= 8) break;
  }
  return keywords;
}

// =============================================================================
// TemplateEngine
// =============================================================================
export class TemplateEngine {

  // =========================================================================
  // renderStatus — md_status 变更感知输出
  // DI 规格: architecture-spec/06 §md_status 返回格式
  // =========================================================================
  renderStatus(data: Record<string, unknown>): string {
    const batches = (data['batches'] as Array<Record<string, unknown>>) ?? [];
    const batchCount = data['batchCount'] ?? batches.length;
    const searchHint = (data['search_hint'] as string) ?? '';

    let result = `## 最近变更 (${batchCount} 批)\n\n`;

    if (batches.length === 0) {
      result += '暂无变更记录。\n\n';
    } else {
      for (const batch of batches) {
        const idx = batch['index'];
        const tw = batch['timeWindow'] as string ?? '';
        const fc = batch['fileCount'] ?? (batch['files'] as Array<unknown>)?.length ?? 0;
        const files = (batch['files'] as Array<Record<string, unknown>>) ?? [];

        result += `### 批次 ${idx}: ${tw} — ${fc} 个文件变更\n\n`;

        for (const f of files) {
          const fn = f['fileName'] as string ?? '';
          const tp = f['type'] as string ?? '';
          const p = f['path'] as string ?? '';
          const lr = f['lineRanges'] as string ?? '';
          const hp = f['headingPath'] as string ?? '';
          const kl = f['keywords_line'] as string ?? '';
          const rl = f['related_line'] as string ?? '';
          const cc = f['changeCount'] as number ?? 0;

          const ccSuffix = cc > 1 ? ` · ${cc} 处变更` : '';
          result += `- **${fn}** (${tp}, ${p})${ccSuffix}\n`;
          if (lr) result += `  行 ${lr}\n`;
          if (hp) result += `  涉及: ${hp}\n`;
          if (kl) result += `  ${kl}\n`;
          if (rl) result += `  ${rl}\n`;
        }
      }
    }


    // _next 引导块：从涉及字段提取关键词，给 agent 具体的搜索方向
    const keywords = extractKeywordsFromFiles(
      (batches as Array<Record<string, unknown>>)
        .flatMap(b => (b['files'] as Array<Record<string, unknown>>) ?? [])
    );
    const searchTip = keywords.length > 0
      ? `变更关键节点: ${keywords.join(', ')}。可调用 md_search 查找这些概念在项目其他文件中的引用。`
      : searchHint;
    result += `\n【务必】使用 Read 工具读取上方文件查看具体变更。${searchTip}\n`;
    result += '【不要】假设以上文件列表完整——未出现在变更列表中的文件可能仍包含相关内容。';

    return result;
  }

  // =========================================================================
  // renderSearch — md_search 全文搜索输出
  // DI 规格: architecture-spec/06 §md_search 返回格式
  // =========================================================================
  renderSearch(data: Record<string, unknown>): string {
    const query = (data['query'] as string) ?? '';
    const totalResults = data['totalResults'] as number ?? 0;
    const results = (data['results'] as Array<Record<string, unknown>>) ?? [];
    const navigateHint = (data['navigate_hint'] as string) ?? '';

    let result = `## 搜索 "${query}" — ${totalResults} 条结果\n\n`;

    if (results.length === 0) {
      // 空结果自然语言（裁决 #11）
      result += '未找到匹配内容。可简化查询词或使用 md_status 检查索引覆盖范围。\n';
    } else {
      let index = 1;
      for (const r of results) {
        const fn = r['fileName'] as string ?? '';
        const fp = r['filePath'] as string ?? '';
        const lr = r['lineRanges'] as string ?? '';
        const score = r['score'] as number ?? 0;
        const hp = r['headingPath'] as string ?? '';
        const snippet = r['snippet'] as string ?? '';
        const rl = r['related_line'] as string ?? '';

        result += `${index}. **${fn}** (${fp}) 行 ${lr} · 相关度 ${score}\n`;
        if (hp) result += `   所属: ${hp}\n`;
        // snippet 是相关性证据，加 … 边框标记截断
        result += `   匹配: …${snippet}…\n`;
        if (rl) result += `   ${rl}\n`;
        if (rl) result += `   ${rl}\n`;
        index++;
      }
    }


    // _next 引导块（ADR-012，DI 模板架构 6.）
    result += '\n【务必】根据匹配行判断文件是否相关——匹配行是相关性证据，不是完整内容。只 Read 通过判断的文件。';
    if (navigateHint) result += navigateHint;
    result += '\n【不要】逐条 Read 全部结果——用匹配行快速筛选，只 Read 真正相关的文件。';

    return result;
  }

  // =========================================================================
  // renderNavigate — md_navigate 链接关系探索输出
  // DI 规格: architecture-spec/06 §md_navigate 返回格式
  // =========================================================================
  renderNavigate(data: Record<string, unknown>): string {
    const fileName = (data['fileName'] as string) ?? (data['sourcePath'] as string) ?? '';
    const topic = (data['topic'] as string) ?? '';
    const direction = (data['direction'] as string) ?? '';
    const depth = data['depth'] as number ?? 1;
    const totalLinks = data['totalLinks'] as number ?? 0;
    const links = (data['links'] as Array<Record<string, unknown>>) ?? [];

    const directionLabel = direction === 'inbound' ? '入链' : '出链';

    let result = `## ${fileName} 的链接关系\n\n`;
    result += `文件主题: ${topic}\n\n`;
    result += `### ${directionLabel} (depth=${depth})\n\n`;

    // 按 targetPath 去重合并：同目标的链接聚合行号和链接文字
    const merged = new Map<string, {
      tfn: string; tp: string; lts: Set<string>; tt: string;
    }>();
    for (const l of links) {
      const tp = l['targetPath'] as string ?? l['linkText'] as string ?? '';
      if (!merged.has(tp)) {
        merged.set(tp, {
          tfn: l['targetFileName'] as string ?? '',
          tp,
          lts: new Set(),
          tt: l['targetTopic'] as string ?? '',
        });
      }
      const lt = l['linkText'] as string ?? '';
      if (lt) merged.get(tp)!.lts.add(lt);
    }

    if (merged.size === 0) {
      result += 'Navigation Results (0 links found for this file)\n';
    } else {
      for (const m of merged.values()) {
        result += `- → **${m.tfn || m.tp}** (${m.tp})`;
        if (m.lts.size > 0) result += ` · "${[...m.lts].join('", "')}"`;
        result += '\n';
        if (m.tt) result += `  主题: ${m.tt}\n`;
      }
    }

    result += `\n共 ${merged.size} 条${directionLabel}。\n`;


    // _next 引导块（ADR-012，DI 模板架构 6.）
    result += '\n【务必】使用 Read 工具读取上方目标文件。depth 参数可扩大遍历层数。如需查看反向关系，使用相反的 direction。\n';
    result += '【不要】仅凭链接文字判断目标文档内容——链接文字不代表目标文档的完整主题。间接引用（depth>1）的文档打开后可能看不到明显的关联上下文，建议先读 depth=1 的结果。';

    return result;
  }

  // =========================================================================
  // renderFiles — md_files 已索引文档全貌
  // =========================================================================
  renderFiles(data: Record<string, unknown>): string {
    const totalFiles = data['totalFiles'] as number ?? 0;
    const recentAdded = data['recentAdded'] as number ?? 0;
    const recentModified = data['recentModified'] as number ?? 0;
    const recentDeleted = data['recentDeleted'] as number ?? 0;
    const tree = data['tree'] as Array<Record<string, unknown>> ?? [];

    // 变更摘要行
    const parts: string[] = [];
    if (recentAdded > 0) parts.push(`+${recentAdded} 新增`);
    if (recentModified > 0) parts.push(`✎${recentModified} 修改`);
    if (recentDeleted > 0) parts.push(`-${recentDeleted} 删除`);
    const changeLine = parts.length > 0 ? `📊 最近 30 分钟: ${parts.join(' · ')}` : '📊 最近 30 分钟: 无变更';

    let result = `## 已索引文档 (${totalFiles} 个文件)\n\n${changeLine}\n`;

    // 递归渲染目录树
    const renderTree = (nodes: Array<Record<string, unknown>>, indent: string): string => {
      let out = '';
      for (const n of nodes) {
        const name = n['name'] as string ?? '';
        const isDir = (n['children'] as Array<unknown>)?.length > 0;
        const topic = n['topic'] as string | undefined;
        const linkCount = n['linkCount'] as number | undefined;
        const rc = n['recentChange'] as string | undefined;
        const path = n['path'] as string | undefined;

        if (isDir) {
          out += `${indent}${name}/\n`;
          out += renderTree(n['children'] as Array<Record<string, unknown>>, indent + '  ');
        } else {
          // 文件行: 文件名 — 主题 · N 条外链 [标记]
          let fileLine = `${indent}${name}`;
          if (topic) fileLine += ` — ${topic}`;
          if (linkCount && linkCount > 0) fileLine += ` · ${linkCount} 条外链`;

          // 最近变更标记
          if (rc === 'added') fileLine += ' ✚';
          else if (rc === 'modified') fileLine += ' ✎';
          else if (rc === 'deleted') fileLine += ' ✕';

          out += fileLine + '\n';
        }
      }
      return out;
    };

    result += '\n' + renderTree(tree, '');

    // 底部：删除文件提示
    if (recentDeleted > 0) {
      result += '\n⚠ 最近删除的文件仍保留索引记录，路径标记 ✕。';
    }

    return result;
  }
}
