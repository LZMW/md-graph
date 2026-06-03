-- =============================================================================
-- md-graph SQLite Schema
-- 4 base tables + 1 FTS5 virtual table + 3 triggers + 9 indexes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- files: 跟踪每个标记文件的元数据
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    path                TEXT    NOT NULL UNIQUE,
    content_hash        TEXT    NOT NULL,
    size                INTEGER NOT NULL,
    mtime_ms            INTEGER NOT NULL,
    indexed_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    node_count          INTEGER NOT NULL DEFAULT 0,
    last_change_details TEXT,
    status              TEXT    NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_files_path   ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);

-- ---------------------------------------------------------------------------
-- doc_nodes: 文档的段落级节点（7 种类型）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doc_nodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES files(id)     ON DELETE CASCADE,
    type          TEXT    NOT NULL
                          CHECK (type IN (
                              'document', 'heading', 'paragraph',
                              'list_item', 'code_block', 'blockquote',
                              'table_row'
                          )),
    line_start    INTEGER NOT NULL,
    line_end      INTEGER NOT NULL,
    col_start     INTEGER NOT NULL,
    col_end       INTEGER NOT NULL,
    searchable    INTEGER NOT NULL DEFAULT 0
                          CHECK (searchable IN (0, 1)),
    parent_id     INTEGER REFERENCES doc_nodes(id),
    ordinal       INTEGER NOT NULL,
    heading_level INTEGER,
    heading_path  TEXT,
    line_ranges   TEXT,
    inline_tokens TEXT,
    snippet       TEXT
);

CREATE INDEX IF NOT EXISTS idx_nodes_file_id      ON doc_nodes(file_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id    ON doc_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type         ON doc_nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_heading_path ON doc_nodes(heading_path);

-- ---------------------------------------------------------------------------
-- doc_node_content: 节点全文内容，FTS5 外部内容表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doc_node_content (
    node_id INTEGER PRIMARY KEY
            REFERENCES doc_nodes(id) ON DELETE CASCADE,
    content TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- edges: 文档间/文档内链接
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_node_id  INTEGER NOT NULL
                    REFERENCES doc_nodes(id) ON DELETE CASCADE,
    target_node_id  INTEGER
                    REFERENCES doc_nodes(id) ON DELETE SET NULL,
    raw_href        TEXT    NOT NULL,
    link_text       TEXT,
    line            INTEGER,
    col             INTEGER,
    status          TEXT    NOT NULL DEFAULT 'resolved'
                    CHECK (status IN ('resolved', 'broken', 'external'))
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_status ON edges(status);

-- ---------------------------------------------------------------------------
-- nodes_fts: FTS5 全文搜索虚拟表（基于 doc_node_content 的外部内容表）
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    content,
    type UNINDEXED,
    content='doc_node_content',
    content_rowid='node_id',
    tokenize='unicode61',
    prefix='2,3'
);

-- ---------------------------------------------------------------------------
-- 触发器：保持 FTS5 索引与 doc_node_content 同步
-- ---------------------------------------------------------------------------

-- Insert: 新增内容时同步到 FTS
CREATE TRIGGER IF NOT EXISTS content_ai
    AFTER INSERT ON doc_node_content
BEGIN
    INSERT INTO nodes_fts(rowid, content, type)
    VALUES (
        new.node_id,
        new.content,
        (SELECT type FROM doc_nodes WHERE id = new.node_id)
    );
END;

-- Delete: 删除内容时从 FTS 移除
CREATE TRIGGER IF NOT EXISTS content_ad
    AFTER DELETE ON doc_node_content
BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, content, type)
    VALUES (
        'delete',
        old.node_id,
        old.content,
        (SELECT type FROM doc_nodes WHERE id = old.node_id)
    );
END;

-- Update: 先删旧内容再插新内容
CREATE TRIGGER IF NOT EXISTS content_au
    AFTER UPDATE ON doc_node_content
BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, content, type)
    VALUES (
        'delete',
        old.node_id,
        old.content,
        (SELECT type FROM doc_nodes WHERE id = old.node_id)
    );
    INSERT INTO nodes_fts(rowid, content, type)
    VALUES (
        new.node_id,
        new.content,
        (SELECT type FROM doc_nodes WHERE id = new.node_id)
    );
END;
