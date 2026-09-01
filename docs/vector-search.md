# 向量检索（vector.mjs）指南

> 本地 BM25 检索，零依赖 Node，无需任何 API key 或外部模型。用于复盘时找**相似历史复盘**、查**策略知识**。

## 用途

- **相似复盘**：复盘某一单时，检索历史复盘里"行情特征相近"的案例，写入复盘文档的"相似案例参考"区块。
- **策略知识**：对策略问题检索 references 知识库（如"止损插针红线""金字塔加仓"）。

## 原理

- **分词**：中文用**字符 bigram**（`复盘ARB` → `复盘,盘A,AR,RB`），英文/数字用 word token（`arbusdt`, `20260901`）。无需外部分词器。
- **倒排索引**：term → 文档列表 + 词频。
- **BM25**：`k1=1.5, b=0.75`；`idf = ln(1 + (N − n + 0.5)/(n + 0.5))`；按相关度排序。
- **文本清洗**：跳过 YAML frontmatter 与代码块（不参与检索）。

## 索引源与来源 tag

| 来源 | 路径 | tag |
|---|---|---|
| 复盘/周报/月报归档 | `${TRADE_HOME}/retrospectives/**/*.md`（默认 `D:/trade`） | `review` |
| 策略知识库 | 脚本同级 `../references/*.md`（本插件 skill 内） | `reference` |

索引自动检测文件 mtime/size 变化，查询时若过期自动重建。

## 命令

### 构建索引

```bash
node vector.mjs index [--out <index.json>]
```

默认写到 `${TRADE_HOME}/vector-index.json`（即 `D:/trade/vector-index.json`），已加入 `D:/trade/.gitignore`。可用 `VECTOR_INDEX_PATH` 环境变量覆盖。

### 查询

```bash
node vector.mjs query "<文本>" [--top N] [--filter review|reference]
```

| 参数 | 说明 | 默认 |
|---|---|---|
| `<文本>` | 查询内容，中文英文皆可 | 必填 |
| `--top N` | 返回条数 | 5 |
| `--filter review\|reference` | 只查复盘 或 只查策略 | 全部 |

## 示例

```bash
# 找止损/插针相关的策略知识
node vector.mjs query "止损 插针 6% 红线" --top 5

# 复盘 ARB 时找相似历史复盘
node vector.mjs query "复盘 ARBUSDT 高波动 派发" --filter review --top 3

# 只查金字塔/博弈心理
node vector.mjs query "金字塔 加仓 博弈心理" --filter reference
```

示例输出（中文）：

```
| 序号 | 类型 | 文件 | 相关度 |
|---|---|---|---|
| 1 | 策略 | trade-assistant/references/07-trade-log-and-review-template.md | 3.449 |
|   |   | # 07 Trade Log & Review Template ... | |
...
找到 0 篇相似复盘，5 条策略知识
```

## 限制与注意

- `D:\trade\retrospectives\` 目前为空 → "相似复盘"查询会返回 0 篇；属正常，此时用 `--filter reference` 拿策略知识，复盘 agent 会优雅处理（写"尚无历史复盘"）。
- 全文检索（整文件作为一个文档），不切 chunk；归档量小（几十个文件）足够。
- 索引是生成物，随时可重建：`node vector.mjs index`。
