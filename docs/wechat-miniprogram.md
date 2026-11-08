# 微信小程序客户端（`miniprogram/`）接入与维护指南

本仓库内置独立的原生微信小程序客户端（位于根目录 `miniprogram/`），与网页工作台共用同一个 Next.js + Payload 服务端、同一套数据库集合与领域服务（项目、点位图、报价、合同、产品库、AI 顾问、打印页）。小程序端不复制独立数据源，也不在客户端存放任何 Payload API Key、数据库凭证或微信 `AppSecret`。

---

## 1. 架构概览

```text
┌──────────────────────────────────────────────────────────────┐
│ 微信小程序（miniprogram/，原生 WXML / WXSS / JavaScript）     │
│  ├─ Authorization: Bearer <token> 调用 /mp/v1/* JSON 接口     │
│  ├─ wx.uploadFile 上传户型图到 /mp/v1/.../sheets 或 /ai/upload │
│  └─ <web-view> 通过一次性票据 /mp/web-login 打开 /print/*      │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│ Next.js App Router + Payload（同一服务端实例）                 │
│  ├─ src/app/(frontend)/mp/v1/**        小程序 REST 接口       │
│  ├─ src/app/(frontend)/mp/web-login    web-view 单次票据入口  │
│  ├─ src/lib/mp/{auth,http,present}.ts  令牌认证、响应、序列化  │
│  ├─ src/lib/services/*                 网页与小程序共享业务层  │
│  ├─ src/plugins/ai-copilot/*           网页与小程序共享 AI 层  │
│  └─ src/collections/{WechatAccounts,MpSessions}.ts           │
└──────────────────────────────────────────────────────────────┘
```

### 核心共享原则

1. **点位图是报价唯一来源**：`projects.pointMap` 同时驱动网页 Excalidraw 画布、小程序点位图页、智能选型与报价明细生成。
2. **统一业务服务层**：
   - `src/lib/services/project-service.ts`：项目创建、编辑、归档/恢复。
   - `src/lib/services/point-map-service.ts`：点位新增、移动/换类型/指定产品、删除、户型图图纸上传（遵守 190KB 场景体积上限，被移除的旧 `files` 键显式写 `null` 以清理 JSON 合并残留）。
   - `src/lib/services/quote-service.ts`：从点位图生成报价、从点位图同步数量、保存报价（型号替换、临时单价、附加费用、优惠、备注）、删除报价。
   - `src/lib/services/contract-service.ts`：从已确认报价生成合同、编辑草稿合同、签订后登记收款、状态流转与删除草稿。
3. **遵循 Local API 访问控制**：所有面向成员的数据读写均传入当前已认证 `user`（含 `collection: 'users'`）并显式设置 `overrideAccess: false`，复用各集合的访问控制与归档只读钩子。

---

## 2. 认证、绑定与令牌模型

小程序不支持浏览器 Cookie 自动携带，因此采用 `Authorization: Bearer <token>` 头认证。

### 2.1 数据集合

| 集合 Slug         | 文件                                | 用途                                                             | 访问控制                                                                                  |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `wechat-accounts` | `src/collections/WechatAccounts.ts` | 微信 `openid` / `unionid` 与成员 `users` 的绑定关系              | 仅 CMS 管理员可在后台查看与删除（删除即解绑）；服务端通过 `overrideAccess: true` 写入     |
| `mp-sessions`     | `src/collections/MpSessions.ts`     | 小程序令牌与一次性票据存储（仅存 `tokenHash` SHA-256，不存原文） | 仅 CMS 管理员可在后台查看与删除（删除即强制下线）；服务端通过 `overrideAccess: true` 维护 |

### 2.2 四类令牌（`mp-sessions.kind`）

| `kind`       | 有效期                                      | 用途                                                                                         |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `session`    | 30 天（距离上次使用超 24 小时自动滑动续期） | 小程序日常 API 请求的 Bearer 令牌                                                            |
| `bind`       | 10 分钟（绑定成功后立即消费删除）           | 首次微信登录未绑定成员时返回的一次性绑定票据                                                 |
| `web-ticket` | 2 分钟（读取即消费删除）                    | 小程序打开 `<web-view>` 打印页前换取的一次性跳转票据                                         |
| `web`        | 2 小时                                      | `/mp/web-login` 消费 `web-ticket` 后写入 `mp-web-session` HttpOnly Cookie 的短期网页会话令牌 |

### 2.3 登录与绑定流程

1. **成员账号由后台管理员在 `/admin`（Users 集合）统一开通**，小程序不开放陌生访客自助注册；停用成员（`status !== 'active'`）的所有令牌立即失效。
2. **微信一键登录（已配置 `WECHAT_MP_APPID` + `WECHAT_MP_SECRET` 时）**：
   - 小程序调用 `wx.login()` 获取临时 `code`，POST 到 `/mp/v1/auth/wechat`。
   - 服务端调用微信 `jscode2session` 换取 `openid`（`session_key` 仅在服务端瞬时使用，不落库、不返回客户端）。
   - 若该 `openid` 已绑定启用中的成员，直接签发 `session` 令牌登录。
   - 若尚未绑定，返回 `{ needBind: true, bindTicket }`，小程序引导成员输入后台开通的邮箱与密码调用 `/mp/v1/auth/bind` 完成绑定并登录。
3. **邮箱密码登录（Fallback / 开发者工具调试）**：
   - 当服务端尚未配置微信凭证，或在开发者工具中使用测试号调试时，登录页自动提供邮箱 + 密码登录（`/mp/v1/auth/password`）。
4. **解绑微信**：
   - 成员可在小程序「我的 → 解除微信绑定」调用 `DELETE /mp/v1/me/wechat`，或由管理员在 `/admin/collections/wechat-accounts` 删除对应记录。解绑会同时让该成员其他通过微信登录的设备下线，当前设备保持登录。

---

## 3. 服务端 API 清单（`/mp/v1`）

- **统一响应格式**：
  - 成功：`{ "ok": true, "data": ... }`
  - 失败：`{ "ok": false, "error": "中文可读错误说明", "code"?: "ERROR_CODE" }`（配对应 HTTP 4xx/5xx 状态码）
- **HTTP 方法约定**：微信小程序 `wx.request` 不支持 `PATCH`，所有修改类接口统一使用 `PUT` 或 `POST`。

| 方法与路径                                                                        | 认证   | 说明                                                                                                                       |
| --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /mp/v1`                                                                      | 免登录 | 健康检查，返回 `{ version, wechatLogin, ai }`                                                                              |
| `POST /mp/v1/auth/wechat`                                                         | 免登录 | `wx.login` 的 `code` 登录或获取 `bindTicket`                                                                               |
| `POST /mp/v1/auth/bind`                                                           | 免登录 | 用 `bindTicket` + 邮箱密码绑定微信并签发令牌                                                                               |
| `POST /mp/v1/auth/password`                                                       | 免登录 | 邮箱密码直接登录                                                                                                           |
| `POST /mp/v1/auth/logout`                                                         | 免登录 | 作废当前 Bearer 令牌                                                                                                       |
| `GET /mp/v1/me` / `PUT /mp/v1/me`                                                 | Bearer | 读取 / 修改个人资料（姓名、电话、邮箱、新密码）                                                                            |
| `DELETE /mp/v1/me/wechat`                                                         | Bearer | 解除当前成员的微信绑定                                                                                                     |
| `GET /mp/v1/meta`                                                                 | Bearer | 枚举元数据（设备类别、33 种设备类型、智能平台、报价/合同状态、区域类型、选型档次、AI 模型/快捷指令、已启用插件、公司抬头） |
| `GET /mp/v1/dashboard`                                                            | Bearer | 工作台统计、最近项目、最近报价                                                                                             |
| `GET /mp/v1/projects` / `POST /mp/v1/projects`                                    | Bearer | 项目分页搜索列表 / 新建项目                                                                                                |
| `GET /mp/v1/projects/[id]` / `PUT /mp/v1/projects/[id]`                           | Bearer | 项目详情（含进度、点位汇总、报价列表、合同、资料清单） / 更新项目或归档恢复                                                |
| `GET /mp/v1/projects/[id]/point-map`                                              | Bearer | 读取项目点位图（图纸、点位、房间区域、图例统计、总价，支持 `?scope=` 过滤）                                                |
| `POST /mp/v1/projects/[id]/points`                                                | Bearer | 在指定图纸坐标 `(rx, ry)` 放置点位                                                                                         |
| `PUT /mp/v1/projects/[id]/points/[pointId]`                                       | Bearer | 移动点位、更换设备类型、指定或清除关联产品（校验产品在售且设备类型一致）                                                   |
| `DELETE /mp/v1/projects/[id]/points/[pointId]`                                    | Bearer | 删除点位                                                                                                                   |
| `POST /mp/v1/projects/[id]/sheets`                                                | Bearer | `multipart/form-data` 上传户型图（自动检测图框裁切并标准化为 A3 横版画幅）                                                 |
| `POST /mp/v1/projects/[id]/defaults`                                              | Bearer | 设置项目默认产品映射                                                                                                       |
| `POST /mp/v1/projects/[id]/smart-select`                                          | Bearer | 按平台与档次一键智能选型                                                                                                   |
| `GET /mp/v1/projects/[id]/quotes` / `POST /mp/v1/projects/[id]/quotes`            | Bearer | 项目报价列表 / 从点位图生成新报价                                                                                          |
| `GET /mp/v1/quotes/[id]` / `PUT /mp/v1/quotes/[id]` / `DELETE /mp/v1/quotes/[id]` | Bearer | 报价详情 / 保存报价（明细、改价、附加费、优惠、状态） / 删除报价                                                           |
| `POST /mp/v1/quotes/[id]/sync`                                                    | Bearer | 将报价明细数量与最新点位图重新同步                                                                                         |
| `GET /mp/v1/projects/[id]/contract` / `POST /mp/v1/projects/[id]/contract`        | Bearer | 读取项目合同与可选已确认报价 / 从报价生成合同                                                                              |
| `PUT /mp/v1/contracts/[id]` / `DELETE /mp/v1/contracts/[id]`                      | Bearer | 保存合同（草稿全量编辑；签订后仅登记收款） / 删除草稿合同                                                                  |
| `POST /mp/v1/contracts/[id]/status`                                               | Bearer | 合同状态流转（签订、履约完成、作废等）                                                                                     |
| `GET /mp/v1/products` / `GET /mp/v1/products/[id]`                                | Bearer | 产品库搜索筛选（类别、设备类型、关键词、分页） / 产品详情                                                                  |
| `POST /mp/v1/ai/chat`                                                             | Bearer | AI 顾问对话（NDJSON 流式输出，支持工具调用修改项目/点位/报价并实时扣减积分）                                               |
| `POST /mp/v1/ai/upload`                                                           | Bearer | AI 对话上传户型图附件并执行 CAD 图形候选识别                                                                               |
| `GET /mp/v1/ai/conversations` / `GET,DELETE /mp/v1/ai/conversations/[id]`         | Bearer | 历史会话列表 / 会话详情与删除                                                                                              |
| `POST /mp/v1/web-ticket`                                                          | Bearer | 为 `/print/...` 路径签发 2 分钟一次性票据                                                                                  |
| `GET /mp/web-login?ticket=...`                                                    | 票据   | 消费一次性票据、设置 `mp-web-session` Cookie 并 `303` 跳转打印页                                                           |

---

## 4. 小程序页面结构（`miniprogram/`）

| 页面路径                   | 说明                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/login/index`        | 微信一键登录、首次账号绑定、邮箱密码登录、调试环境下服务器地址切换                                                                                   |
| `pages/home/index`         | 工作台（关键指标、快捷入口、最近项目、最近报价）                                                                                                     |
| `pages/projects/index`     | 项目列表（状态切换、关键词搜索、下拉刷新、分页）                                                                                                     |
| `pages/project-edit/index` | 新建 / 编辑项目资料（客户、电话、小区、面积、智能平台、备注）                                                                                        |
| `pages/project/index`      | 项目概览（五步进度、点位与金额统计、报价单列表、合同入口、打印资料入口、归档切换）                                                                   |
| `pages/pointmap/index`     | 施工点位图（多图纸切换、离散缩放 `1x/1.5x/2x/3x`、专业范围过滤、点击放置/移动/换类型/指定产品/删除、上传户型图、一键智能选型、生成报价、打印点位图） |
| `pages/quote/index`        | 报价单详情与编辑（从点位图同步、替换产品、修改单价/数量、附加费用、优惠、状态切换、打印报价单）                                                      |
| `pages/contract/index`     | 合同管理（从已确认报价生成、付款比例 40/50/10% 或自定义、条款编辑、签订与收款登记、打印合同）                                                        |
| `pages/products/index`     | 产品库 Tab 页（复用 `components/product-list`）                                                                                                      |
| `pages/picker/index`       | 非 Tab 模态选品页（供点位指定型号、报价替换型号通过 `eventChannel` 回传所选产品）                                                                    |
| `pages/product/index`      | 产品详情页（高清图、参数、规格、价格、库存）                                                                                                         |
| `pages/ai/index`           | AI 智能顾问（绑定当前项目、快捷指令、上传户型图、NDJSON 分块流式回复、工具执行跳转、历史会话管理）                                                   |
| `pages/mine/index`         | 个人中心（资料修改、密码修改、微信绑定状态与解绑、公司抬头与系统插件状态、退出登录）                                                                 |
| `pages/webview/index`      | 通过 `/mp/v1/web-ticket` 安全打开 `/print/*` 打印页                                                                                                  |

---

## 5. 户型图上传与点位识别规则

1. **图框自动裁切与标准化**：上传户型图时，`src/lib/floor-plan-normalize.ts` 使用 `detectPlanBounds` 检测外图框与右下角标题栏，自动裁去冗余边框并调用 `fitIntoSheet` 居中放入标准 A3 横版画幅（`2400 × 1600`）。
2. **保护已有图纸与点位**：
   - 仅当项目中只有唯一一张空白默认图纸（`blank: true`）且该图纸上**没有任何已放置点位、也没有任何房间区域**时，新上传的真实户型图才会替换这张空白图纸；
   - 只要图纸上已有任何点位或房间区域，上传户型图或 AI 调用 `add_floor_sheet` 一律**追加为新图纸**，绝不覆盖已有数据。
3. **诚实的点位识别**：
   - 未启用识别或未识别出有效点位时，图纸以 **0 个点位**创建，绝不生成虚假的默认示例点位；
   - 纯文本 AI 模型不会凭空编造坐标。

---

## 6. 环境变量说明

在托管平台或服务器环境变量中按需配置以下变量（请勿将真实密钥写入代码库、`miniprogram/` 或公开文档）：

| 变量名             | 必填                   | 用途                                                   |
| ------------------ | ---------------------- | ------------------------------------------------------ |
| `WECHAT_MP_APPID`  | 启用微信一键登录时必填 | 微信小程序 AppID（如 `wx1234567890abcdef`）            |
| `WECHAT_MP_SECRET` | 启用微信一键登录时必填 | 微信小程序 AppSecret（仅存服务端，严禁放入小程序代码） |
| `DEEPSEEK_API_KEY` | 启用 AI 顾问时配置     | DeepSeek 密钥（服务端读取，小程序与网页共用）          |

> 未设置 `WECHAT_MP_APPID` / `WECHAT_MP_SECRET` 时，`GET /mp/v1` 返回 `wechatLogin: false`，小程序登录页会自动隐藏或降级微信一键登录按钮，改用邮箱密码登录。

---

## 7. 微信公众平台配置与发布上线步骤

### 7.1 前置条件

1. 已注册微信小程序账号，获取真实的 **AppID** 与 **AppSecret**。
2. 服务端域名已具备 **HTTPS（TLS 1.2+）** 证书并完成 **ICP 备案**（微信正式版/体验版均要求 HTTPS 且不能带非标端口）。

### 7.2 配置服务器合法域名

登录 [微信公众平台](https://mp.weixin.qq.com/) → **开发管理** → **开发设置** → **服务器域名**，将你的正式服务端域名（例如 `https://smart.your-company.com`）添加到：

- **request 合法域名**：`https://smart.your-company.com`
- **uploadFile 合法域名**：`https://smart.your-company.com`（用于上传户型图）
- **downloadFile 合法域名**：`https://smart.your-company.com`（用于下载或预览图纸/图片）

### 7.3 配置 `web-view` 业务域名（用于打开打印页）

小程序通过 `<web-view>` 打开 `/print/*` 打印页时，微信要求该域名已配置为**业务域名**：

1. 在微信公众平台 → **开发设置** → **业务域名** 点击新增；
2. 下载微信提供的校验文件（形如 `MP_verify_xxxxxxxx.txt`），放入本仓库的 `public/` 目录下并部署，确保 `https://smart.your-company.com/MP_verify_xxxxxxxx.txt` 可直接访问；
3. 保存业务域名配置。

### 7.4 修改小程序端配置并在微信开发者工具中打开

1. 编辑 `miniprogram/project.config.json`：
   - 将 `"appid": "touristappid"` 替换为真实的小程序 AppID。
2. 编辑 `miniprogram/config.js`：
   - 将 `apiBaseUrl: 'https://fmkj.example.com'` 替换为你的真实 HTTPS 域名（不带末尾斜杠，不带 `/mp/v1`）。
3. 打开**微信开发者工具** → **导入项目** → 目录选择本仓库下的 `miniprogram/`：
   - **本地开发调试**：可在开发者工具右上角「详情 → 本地设置」勾选**「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**，并在小程序登录页底部「服务器地址」填入本地或预览地址（如 `http://127.0.0.1:3000`）。
   - **真机预览与提审发布**：取消勾选「不校验合法域名」，确认 `config.js` 指向已备案的正式 HTTPS 域名后，点击「上传」并在微信公众平台提交审核与发布。

---

## 8. 已知边界与后续演进建议

1. **真机与开发者工具实测**：当前仓库环境无微信开发者工具 GUI 及真实 `WECHAT_MP_APPID` / `WECHAT_MP_SECRET`，已完成全部静态语法/JSON/WXML/资源引用检查与服务端读写链路实测；正式上线前需在微信开发者工具与 iOS/Android 真机完成首次微信登录绑定、`wx.request({ enableChunked: true })` 流式回复、点位图缩放点击坐标与 `<web-view>` 打印页联调。
2. **双指无级缩放**：点位图页目前采用稳定的离散倍率按钮（`1x / 1.5x / 2x / 3x`）配合 `scroll-view` 滚动与 `boundingClientRect` 坐标换算；后续可基于 WXS 响应函数扩展双指捏合手势。
3. **产品大图列表加载**：产品库与图纸图片直接复用 `/api/media/file/...`；若后续自托管环境存在大量高分辨率 PNG 原图，建议在 CDN 层或 Media 集合开启缩略图尺寸以进一步降低移动网络流量。
