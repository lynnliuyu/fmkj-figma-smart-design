# memory/ — 跨 Agent 经验记忆

换任何 Agent 接手都能读到的经验层。**append-only**，不要删旧条目。

## learnings.jsonl

一行一条 JSON。格式：

```json
{"date":"YYYY-MM-DD","area":"ci|repo|issue|docs|prod","finding":"发现的问题","action":"做了什么","status":"open|fixed"}
```

只记**值得留下来的**：踩过的坑、非显而易见的约束、决策及理由。
不要记：密钥、客户资料、数据库导出、任何敏感信息。

## 为什么放在仓库里

`PROJECT-ARCHITECTURE.md` 写的是「仓库优先，不绑定工具」——记忆也遵守这条。
聊天记录、某个 Agent 的私有上下文都会丢；仓库文件不会。
