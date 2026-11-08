# DreamStars / 繁梦空间 全自动化维护团队规划

> 版本：v1.0
> 日期：2026-11-07
> 定位：日常维护自动化方案（架构变更仍需人工批准）

---

## 1. 目标

让系统日常维护自动跑起来：

```text
巡检
测试
依赖升级
安全扫描
文档同步
Bug 修复
构建与部署
周报
```

架构变更仍然遵守：

```text
修改前 / 修改后 → 用户批准 → 改代码 → 更新文档
```

日常功能修复、测试、依赖、文档不需要人工逐个盯。

---

## 2. 团队角色

| 角色       | 职责                                 | 权限          |
| ---------- | ------------------------------------ | ------------- |
| 巡检 Agent | 站点、接口、磁盘、数据库、证书、备份 | 只读          |
| 测试 Agent | typecheck、单测、构建、冒烟、回归    | 只读 + 跑 CI  |
| 依赖 Agent | 依赖升级、安全补丁                   | 只能开 PR     |
| 审查 Agent | 代码审查、风险标记                   | 只读          |
| 修复 Agent | 小 bug、lint、类型错误、测试修复     | 开 PR         |
| 文档 Agent | 文档、变更记录、架构文档同步         | 开 PR         |
| 发布 Agent | 构建、部署、回滚                     | 受控部署      |
| 汇报 Agent | 日报 / 周报 / 告警                   | 只读 + 发消息 |

---

## 3. 触发方式

```text
定时：每天巡检、每周依赖、每月审计
事件：CI 失败、Issue、PR、监控告警、部署失败
人工：给 Issue 打标签、在 PR 里 @agent
```

---

## 4. 自动化分级

### L0 只读

巡检、报告、诊断，不改代码。

### L1 低风险自动

```text
lint
格式化
文档
依赖 patch/minor
测试补充
类型错误
```

流程：

```text
Agent 开 PR → CI 通过 → 审查 Agent 通过 → 自动合并
```

### L2 功能修复

```text
普通 bug
接口兼容修复
UI 修复
```

流程：

```text
Agent 开 PR → CI + 测试 → 审查 → 自动合并或你点一下
```

### L3 架构变更

```text
模块边界
数据模型
权限模型
插件 / AI 模块
模板体系
```

必须：

```text
写提案 → 修改前/修改后 → 你批准 → 实施 → 更新 PROJECT-ARCHITECTURE.md
```

### L4 生产发布

```text
L1 / L2：CI 通过 + 健康检查 + 可回滚，可自动
L3：必须人工批准
```

---

## 5. 推荐工具栈

### 编排

- [GitHub Actions](https://docs.github.com/en/actions)
- 自托管 Runner：放在部署服务器，负责构建和发布

### 依赖与安全

- [Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-security-updates)
- [Renovate](https://github.com/renovatebot/renovate/blob/main/docs/usage/index.md)

### 代码 Agent

- [SWE-agent](https://github.com/swe-agent/swe-agent)
- [Aider](https://github.com/Aider-AI/aider)
- [AutoGen](https://github.com/microsoft/autogen)
- [CrewAI](https://github.com/crewAIInc/crewAI)
- [MetaGPT](https://github.com/FoundationAgents/MetaGPT)
- [GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agent-capabilities/about-agents/about-third-party-coding-agents)
- [Copilot 修复失败 Actions](https://github.blog/changelog/2026-05-18-one-click-fixes-for-failing-actions-with-copilot-cloud-agent/)

### 审查

- [CodeRabbit](https://github.com/coderabbitai)
- 自建审查 Agent

### 自动合并

- [Kodiak](https://github.com/marketplace/kodiakhq)
- [Mergify](https://docs.mergify.com/migrate/kodiak/)

### 监控

- Uptime 监控
- 错误监控
- 每日健康检查
- [自主 CI 修复参考项目](https://github.com/nandanadileep/autonomous-ci-repair)

---

## 6. 红线

```text
不能直接推 main
不能跳过 CI
不能改架构而不写提案
不能碰生产密钥
不能无限制花钱
不能同时多人改同一文件
```

每个 Agent 必须有：

```text
写范围
每日预算
最大 PR 大小
超时时间
回滚方案
```

---

## 7. 实施阶段

### Phase 0：仓库和基础设施

- CI：typecheck、测试、构建
- 分支保护
- 健康检查接口
- 监控告警
- 数据库备份验证

### Phase 1：只读团队

- 每日巡检
- 每周依赖报告
- 每周测试报告
- Issue 分类
- 周报

### Phase 2：辅助修复

- L1 自动开 PR
- CodeRabbit / 审查 Agent
- 你合并

### Phase 3：半自动

- L1 自动合并
- L2 开 PR + 你确认
- staging 自动部署
- 生产手动

### Phase 4：日常全自动

- L1 / L2 自动合并
- 生产可自动发布 + 自动回滚
- 架构变更仍然人工批准
- 每周汇总报告

---

## 8. 仓库结构建议

```text
.github/
  workflows/
    ci.yml
    nightly.yml
    deps.yml
    deploy.yml
  agents/
    ops.md
    qa.md
    fixer.md
    reviewer.md
    release.md
  CODEOWNERS

ops/
  runbooks/
  checks/

docs/
  AUTOMATION.md
```

---

## 9. 参考：yoyo-evolve 的自我进化机制

参考项目：[yologdev/yoyo-evolve](https://github.com/yologdev/yoyo-evolve)

它的核心循环：

```text
每 3 小时醒来
→ 读自己的源码
→ 看 GitHub issues
→ 规划要改什么
→ 改代码
→ 跑测试
→ 测试过就 commit，不过就 revert
→ 回复 issue，继续睡
```

另外两个循环：

```text
每 4 小时：读 GitHub Discussions，参与讨论，学习
每天：把 JSONL 记忆压缩成 active context，注入下一次提示
```

它公开的做法里值得抄的：

- 所有提交都经过测试门禁，测试不过自动回滚
- 记忆用 append-only JSONL，压缩后生成 active context
- Issue 用 `agent-input` / `agent-self` / `agent-help-wanted` 标签分类
- 社区点赞/点踩当优先级和免疫系统
- 身份和人格写在 `IDENTITY.md` / `PERSONALITY.md`
- 用 GitHub App + Actions 跑，不靠人守着

## 10. 参考：yetone 维护 Magpie 的做法

原帖：[yetone on X](https://x.com/yetone/status/2109855710444237018)
拆解参考：[Clauday 汇总](https://clauday.com/article/5c8e99d9-ecee-4ad7-9bba-8e88ff811bf6)

核心是三个常驻 loop：

```text
Loop 1：GitHub issues / PR / Discord
  每个 PR 都要读代码并真正跑一遍再合并

Loop 2：Twitter 反馈
  先用便宜模型筛选，再交给强模型处理

Loop 3：清理和复盘
  定期清理代码、记录不该合并的 PR、拉黑重复低质量贡献者
```

人只处理一小段 UI/UX 细节。判断标准靠：

```text
memory 文件
仓库里的设计文档
早期头脑风暴记录
```

## 11. 适配到 DreamStars

不能直接照搬 yoyo-evolve 的「自己改自己上线」，因为我们是：

```text
Next.js + Payload + PostgreSQL
还有生产服务器和真实客户数据
```

建议：

- 抄它的循环结构、记忆、测试门禁、回滚
- 用 GitHub Actions 做触发和门禁
- 用 DSH / Codex / Copilot coding agent 做执行
- 所有改动走 PR，不直接推 main
- 架构变更仍然按 PROJECT-ARCHITECTURE.md 走审批

### 第一步可以做的三个 loop

```text
Loop A 巡检与修复
  每天：站点健康、错误日志、磁盘、数据库、证书、备份
  发现 CI 失败或小 bug → 开 PR

Loop B 反馈与文档
  读 GitHub issue / 讨论 / 用户反馈
  先用便宜模型分类，再决定是否动手
  文档和架构文档同步

Loop C 清理与复盘
  每周：死代码、未使用依赖、测试缺口、坏 PR 复盘
  写进 memory/learnings.jsonl
```

## 12. 闭源仓库的调整

我们的仓库是闭源的，yoyo-evolve 的公开进化玩法不能直接照搬。

### 能做的

- Loop A 巡检与修复：照做，但只在自己仓库内部
- Loop C 清理与复盘：照做，写内部 memory
- 测试门禁、失败回滚、PR 流程：照做
- 记忆 JSONL + active context：照做

### 不做的

- 不做公开 Discussions 社交循环
- 不做公开 issue 投票
- 不把源码、客户数据、密钥发给不受控的第三方

### 闭源安全要求

```text
代码可以给谁：只给批准的模型/Agent
不能给谁：任何公开渠道、公开 issue、公开仓库
不能进提示词：.env、密钥、客户资料、数据库导出
```

### 运行位置

- GitHub Actions：负责触发、CI、门禁
- 自托管 Runner：放在独立机器，不放在生产服务器
- 生产部署：只给最小权限的部署密钥
- 数据库：Agent 不直连生产库，只读健康接口

### 工具选择注意

- Codex / Copilot / Claude 等云端 Agent 会把代码发到对应厂商
- 如果闭源要求严格：用自托管模型，或只让 Agent 处理脱敏代码
- 密钥用 GitHub 加密 Secrets 或 OIDC，不写进仓库

## 13. GrokBot 开发 + 本地兜底

### 目标

```text
主力：GrokBot 开发
兜底：GrokBot 积分用完后，本地 Agent 继续
切换：通过 GitHub 交接，不依赖聊天记录
```

### 仓库优先，不绑定工具

所有上下文放仓库：

```text
AGENTS.md                  构建、测试、约定、红线
PROJECT-ARCHITECTURE.md    架构和审批规则
AUTOMATION-TEAM.md         自动化团队规则
GitHub Issues              任务队列
Pull Requests              代码交接
memory/learnings.jsonl     经验记忆
```

换任何 Agent 都能接手。

### GrokBot 怎么接

1. 用 GitHub 连接器连私有仓库
2. 权限最小化：只能读写分支、Issue、PR
3. 不给仓库 Secrets、生产密钥、数据库
4. 让它先读 `AGENTS.md` + `PROJECT-ARCHITECTURE.md`
5. 所有代码改动走分支 + PR，不直接推 main

### 本地兜底怎么接

本地可用：

```text
DSH 团队
Grok CLI（@xai-official/grok）
Codex CLI
Claude Code
Aider
OpenHands
```

要求：

```text
同一份 AGENTS.md
同一条 CI
同一套分支命名
同一个任务 Issue
```

### 积分用完的交接协议

```text
GrokBot 在 Issue 里写：
  - 已完成
  - 当前分支
  - 下一步
  - 卡在哪里
  - 标记 needs-local

本地 Agent：
  - 读 Issue
  - 切到同一分支
  - 继续做
  - 完成后开 PR
```

不重新做一遍，不依赖 GrokBot 的聊天记录。

### 第一个任务建议

Astryx 试点：

```text
装 Astryx
配 Next.js + Tailwind 桥接
选一个新页面试点
截图对比
保留旧组件
```

验收：

```text
tsc 通过
测试通过
build 通过
不改画布 / 打印 / 方案 deck / 小程序
```

## 14. 需要确认

1. 自动化运行在哪：
   - GitHub Actions
   - 自托管 Runner
   - 还是这套 DSH 团队
2. 代码 Agent 用哪个：
   - Codex
   - Copilot coding agent
   - SWE-agent / Aider
   - DSH 自己
3. 自动合并范围：
   - 只 L1
   - L1 + L2
4. 生产是否允许自动发布
5. 每日预算上限
6. 告警和报告发到哪里：
   - 企业微信
   - 邮件
   - GitHub Issue
