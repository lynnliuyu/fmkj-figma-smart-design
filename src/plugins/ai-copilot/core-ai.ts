import { DESIGN_RULE_TEXT } from '@/lib/design-rules'
import { DEVICE_CATEGORIES } from '@/lib/device-types'
import { PROJECT_PLATFORMS } from '@/lib/projects'
import type { PluginAiSpec } from '@/plugins/ai-types'

/**
 * 核心工作台 AI 能力（随 ai-copilot 插件启用）：
 * 覆盖项目信息、点位图、产品库检索、报价单、合同与导出链接。
 */
export const coreAiSpec: PluginAiSpec = {
  permissions: [
    'projects:read',
    'projects:write',
    'point-map:read',
    'point-map:write',
    'catalog:read',
    'defaults:write',
    'quotes:read',
    'quotes:write',
    'contracts:read',
    'contracts:write',
    'documents:read',
    'images:generate',
  ],
  guidance: [
    '当用户提出创建或修改请求时，主动调用对应工具直接完成操作（可分多步连续调用，例如：新建项目 → 布置房间和点位 → 智能选型 → 生成报价单），不要只给口头步骤。',
    '当用户上传了真实户型图图片时，严禁调用 setup_rooms_and_points 生成网格默认点位！只有图像真实识别出点位（add_floor_sheet 的 detectedPoints）或用户提供了点位 JSON（import_points_json）时才生成点位图标；若未识别出点位，保持点位图为空（0 点位）。',
    '当用户要求生成图片、画效果图、方案配图、场景图时，必须调用 generate_image 工具；不要声称已生成图片但没有调用。用户上传了参考图时设置 useAttachedImage=true。生成后把视觉质检结论告诉用户，质检分低于 7 时主动提出重新生成。',
    '项目已有户型图纸、用户要求规划或补齐 AP、窗帘、传感器、摄像头、中控屏、音箱、网关、VRF 等智能设备时，调用 plan_points_with_vision（视觉模型看图按规范布点），不要调用 setup_rooms_and_points。',
    '当用户上传或粘贴别家的报价单 / 设备清单要求比价时：先逐行识别品名、品牌、型号、数量与单价（安装调试、布线辅材等服务项放入 fees），再调用 create_quote_from_competitor 生成对比报价单，最后按行总结匹配型号与差价，不要把外店的服务项当成设备。',
  ],
  knowledge: [
    {
      id: 'core-workflow',
      title: '平台五步核心业务主链路',
      summary: '项目信息 → 点位图设计 → 报价台 → 施工合同 → 归档导出',
      rules: [
        '主链路固定为：1. 项目信息 → 2. 点位图（fmkj-board-system）→ 3. 报价单（与点位双向同步）→ 4. 施工合同（三阶段分期付款）→ 5. 归档与交付资料包。',
        `支持的生态主平台：${PROJECT_PLATFORMS.join('、')}。`,
        `设备 11 大类及编号前缀：${DEVICE_CATEGORIES.map((c) => `${c.name}(${c.code})`).join('、')}。`,
      ],
    },
    {
      id: 'point-design-rules',
      title: '点位图照图识别与默认设计规范',
      summary: '强电开关插座灯具只照图识别，弱电与传感器按数量规范布置',
      rules: [
        DESIGN_RULE_TEXT,
        '导出点位图与方案平面图时统一直接展示标准化 SVG 设备图标，不使用纯数字圆点代号。',
      ],
    },
  ],
  skills: [
    {
      id: 'tpl-competitor-quote',
      name: '竞品报价单识图转配单',
      category: '选型报价',
      description:
        '上传外店报价单截图或粘贴 Excel 表格，AI 逐行识别并匹配本平台同级型号，在当前项目生成对比报价单与差价分析',
      modelHint: 'vision',
      recommendedModelId: 'qwen-vl-plus',
      requiredPlugins: [],
      variables: [
        {
          key: 'strategy',
          label: '匹配策略',
          defaultValue: '同级优先',
          options: ['同级优先', '同品牌优先', '性价比优先'],
        },
        {
          key: 'brand',
          label: '优先品牌',
          defaultValue: '不限',
          options: ['不限', 'Aqara', '小米', '领普', '易来', '华为'],
        },
      ],
      promptTemplate:
        '我上传了客户从别家拿来的报价单（截图或粘贴的表格）。请先逐行识别品名、品牌、型号、数量和单价，安装调试、线材辅材等服务项单独列为费用；然后按【{strategy}】策略（优先品牌：{brand}）调用「竞品报价单转配单」工具，在当前项目生成对比报价单。最后用表格列出每行匹配到的型号、单价差和整单差价，并给出 3 条向业主解释我们方案优势的话术。',
    },
  ],
  tools: [
    {
      name: 'list_projects',
      title: '项目查询',
      description:
        '查询或搜索项目列表（可按关键词、状态、主平台筛选），也可用来把某个已有项目设为当前操作项目。',
      cost: 0.2,
      permissions: ['projects:read'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '项目名称、客户姓名或小区关键词（可选）' },
          status: {
            type: 'string',
            enum: ['active', 'archived', 'all'],
            description: '进行中 active / 已归档 archived / 全部 all（默认 active）',
          },
          switchToProjectId: {
            type: 'string',
            description: '如果需要切换到某个项目继续操作，传入该项目 ID（可选）',
          },
        },
      },
    },
    {
      name: 'create_project',
      title: '新建项目',
      description:
        '创建一个新的全屋智能项目。项目名称留空时会按「小区 + 房号」或客户姓名自动生成。创建成功后会自动将当前会话关联到该新项目。',
      cost: 0.5,
      permissions: ['projects:write'],
      scope: 'workspace',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '项目名称（可选，留空自动按小区+房号或客户名生成）',
          },
          customerName: { type: 'string', description: '客户姓名（如 张先生）' },
          customerPhone: { type: 'string', description: '客户电话' },
          community: { type: 'string', description: '小区 / 楼盘名称（如 西溪壹号）' },
          address: { type: 'string', description: '房号 / 详细地址（如 3幢1201）' },
          platform: {
            type: 'string',
            enum: [...PROJECT_PLATFORMS],
            description:
              '主平台（米家 / Aqara Home / Apple Home / 华为鸿蒙智家 / KNX / Control4 / 网络/弱电 / 待定）',
          },
          budget: { type: 'number', description: '客户预算（元，可选）' },
          notes: { type: 'string', description: '项目备注（可选）' },
        },
      },
    },
    {
      name: 'update_project',
      title: '修改项目信息',
      description:
        '修改当前关联项目（或指定 projectId）的基本信息、主平台、预算、备注，或将项目归档/恢复。',
      cost: 0.5,
      permissions: ['projects:write'],
      scope: 'project',
      mutates: true,
      projectArg: 'projectId',
      allowArchived: true,
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '项目 ID（可选，不传则修改当前关联项目）' },
          name: { type: 'string', description: '项目名称' },
          customerName: { type: 'string', description: '客户姓名' },
          customerPhone: { type: 'string', description: '客户电话' },
          community: { type: 'string', description: '小区 / 楼盘' },
          address: { type: 'string', description: '房号 / 详细地址' },
          platform: { type: 'string', enum: [...PROJECT_PLATFORMS], description: '主平台' },
          budget: { type: 'number', description: '预算（元）' },
          notes: { type: 'string', description: '备注' },
          status: {
            type: 'string',
            enum: ['active', 'archived'],
            description: '状态：active 进行中 / archived 已归档',
          },
        },
      },
    },
    {
      name: 'add_floor_sheet',
      title: '添加户型图纸',
      description:
        '将户型图纸添加或更新到当前关联项目的点位图中。当用户说「重新生成点位 / 重新识别刚才的图纸 / 改成导入全部点位」时，绝不要让用户重新上传图片！直接调用本工具（可省略 url 和 mediaId，服务端会自动复用当前项目已有的图纸或历史上传图纸），并设置 replaceExisting=true（及按需设置 redetect=true）即可原地重新识别并替换点位。',
      cost: 1,
      permissions: ['point-map:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              '图片 URL（如 /api/media/file/...；若是对当前项目已有图纸重新生成/切换导入模式，可省略不传）',
          },
          mediaId: {
            type: 'string',
            description: '上传后返回的 mediaId（可选，省略时自动匹配当前项目已有图纸）',
          },
          sheetName: { type: 'string', description: '图纸名称（如 一层平面图、二层开关布置图）' },
          importMode: {
            type: 'string',
            enum: ['switches', 'all', 'none'],
            description:
              '点位导入范围：switches 仅导入开关（默认，避免将灯具圆圈混入开关图）；all 导入开关+筒灯/射灯全部识别点位；none 仅添加干净图纸不生成点位',
          },
          replaceExisting: {
            type: 'boolean',
            description:
              '是否清空该图纸上的旧点位与旧区域后重新生成（当用户要求「重新生成 / 重新识别 / 切换为全部导入」时设为 true，默认对同一张图纸自动原地替换）',
          },
          redetect: {
            type: 'boolean',
            description:
              '是否强制重新读取图纸文件并调用 CAD 识别器与视觉大模型重新识别点位（当用户觉得识别不准或要求「重新识别」时设为 true）',
          },
          detectedPoints: {
            type: 'array',
            description:
              '可选：通常无需传递（传入 mediaId 后服务端会自动读取已识别点位；禁止编造坐标）',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: '设备类型代号（如 switch-2, switch-3, downlight, ceiling-light）',
                },
                x: { type: 'number', description: '0-1 水平比例坐标' },
                y: { type: 'number', description: '0-1 垂直比例坐标' },
              },
              required: ['type', 'x', 'y'],
            },
          },
        },
      },
    },
    {
      name: 'import_points_json',
      title: '导入点位JSON',
      description:
        '将用户拖入上传或粘贴的 fmkj-points 格式点位识别 JSON（含 sheets / areas / points）直接导入到当前关联项目的点位图中。',
      cost: 1,
      permissions: ['point-map:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          jsonText: { type: 'string', description: '完整的点位 JSON 字符串' },
        },
        required: ['jsonText'],
      },
    },
    {
      name: 'setup_rooms_and_points',
      title: '点位图房间与布点',
      description:
        '仅用于【没有上传户型图】的纯文字需求项目，在空白示意图上创建房间框和设备点位。只布置 WiFi AP、网络面板、窗帘电轨、网关、中控屏、VRF 控制器、人体传感器、音箱、摄像头；开关、插座、灯具没有图纸准确点位时不生成。如果项目已经上传了真实户型图（非空白图），严禁调用此工具生成网格默认点位！',
      cost: 2,
      permissions: ['point-map:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          sheetName: { type: 'string', description: '图纸名称（默认「一层平面图」）' },
          mode: {
            type: 'string',
            enum: ['append', 'replace'],
            description: 'append 在现有基础上追加（默认）；replace 清空当前图纸后重新生成',
          },
          rooms: {
            type: 'array',
            description: '要布置的房间及每个房间内的设备点位列表',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description:
                    '房间名称（如 玄关、客厅、餐厅、厨房、主卧、次卧、儿童房、书房、主卫、客卫、阳台）',
                },
                type: {
                  type: 'string',
                  description:
                    '房间类型可选：entrance, living, dining, kitchen, bedroom, kids, study, bathroom, balcony, corridor, cloakroom, utility',
                },
                devices: {
                  type: 'array',
                  description: '该房间内要放置的设备类型及数量',
                  items: {
                    type: 'object',
                    properties: {
                      deviceType: {
                        type: 'string',
                        description:
                          '设备类型（如 switch-1, switch-2, switch-3, switch-4, socket, socket-double, socket-usb, downlight, spotlight, track-light, ceiling-light, light-strip, curtain-track, smart-lock, doorbell, camera, motion-sensor, contact-sensor, water-sensor, smoke-sensor, temp-sensor, gateway, touch-panel, speaker, ac-router, ap-node, network-panel, vrf-controller）',
                      },
                      count: { type: 'number', description: '数量（1–20）' },
                    },
                    required: ['deviceType', 'count'],
                  },
                },
              },
              required: ['name', 'devices'],
            },
          },
        },
        required: ['rooms'],
      },
    },
    {
      name: 'search_products',
      title: '产品库检索',
      description:
        '搜索平台产品库（728 款在售产品）：可按关键词、设备类型、品牌名称、生态平台、最高价格筛选，返回产品 ID、型号、SKU、品牌、售价与成本。',
      cost: 0.3,
      permissions: ['catalog:read'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词（如 零火开关、人体存在、静音窗帘、网关）',
          },
          deviceType: {
            type: 'string',
            description:
              '设备类型代号（如 switch-1, switch-2, switch-3, curtain-track, smart-lock, motion-sensor, water-sensor, gateway, downlight）',
          },
          brand: { type: 'string', description: '品牌名称（如 Aqara、小米、领普、易来）' },
          platform: {
            type: 'string',
            description: '生态平台（如 米家、Apple Home、华为、涂鸦、Matter、KNX）',
          },
          maxPrice: { type: 'number', description: '最高单价（元）' },
        },
      },
    },
    {
      name: 'set_project_defaults',
      title: '指定默认型号',
      description:
        '为当前关联项目的指定设备类型设置具体的默认产品型号（传入设备类型与对应的产品 ID）。',
      cost: 0.5,
      permissions: ['defaults:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                deviceType: {
                  type: 'string',
                  description: '设备类型代号（如 switch-3, curtain-track）',
                },
                productId: {
                  type: 'string',
                  description: '产品 ID（可通过 search_products 获取）',
                },
              },
              required: ['deviceType', 'productId'],
            },
          },
        },
        required: ['items'],
      },
    },
    {
      name: 'get_project_details',
      title: '项目点位与报价明细',
      description:
        '读取当前关联项目的详细点位清单、已汇总的产品金额、以及项目下所有报价单和合同信息。',
      cost: 0.2,
      permissions: ['projects:read', 'point-map:read', 'quotes:read', 'contracts:read'],
      scope: 'project',
      mutates: false,
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'create_or_update_quote',
      title: '报价单生成与修改',
      description:
        '为当前关联项目生成一份新的报价单（根据点位图和默认型号汇总），或修改已有的报价单（传入 quoteId 可修改标题、状态 draft/sent/accepted、优惠金额 discount、附加费用 fees 如安装调试费、备注 notes）。',
      cost: 1,
      permissions: ['quotes:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          quoteId: {
            type: 'string',
            description: '要修改的已有报价单 ID（不传则根据点位图新建一份报价单）',
          },
          title: { type: 'string', description: '报价单标题（可选）' },
          status: {
            type: 'string',
            enum: ['draft', 'sent', 'accepted'],
            description: '报价单状态：draft 草稿 / sent 已发送 / accepted 已确认',
          },
          discount: { type: 'number', description: '优惠减免金额（元，非负数字）' },
          fees: {
            type: 'array',
            description: '附加费用列表（如安装调试费、线材辅料费）',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '费用名称（如 安装调试费）' },
                amount: { type: 'number', description: '金额（元）' },
              },
              required: ['name', 'amount'],
            },
          },
          notes: { type: 'string', description: '报价单备注说明' },
        },
      },
    },
    {
      name: 'create_quote_from_competitor',
      title: '竞品报价单转配单',
      description:
        '把客户提供的外店报价单（识图结果或粘贴的 Excel 表格）逐行匹配到本平台产品库的同级型号，在当前关联项目生成一份对比报价单（草稿）。传入每行的品名、品牌、型号、数量和外店单价；返回逐行匹配结果、本店合计、外店合计与差价。安装调试等服务项请放在 fees。',
      cost: 2,
      permissions: ['catalog:read', 'quotes:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          competitorName: { type: 'string', description: '外店名称（可选，如 某某智能家居）' },
          title: {
            type: 'string',
            description: '新报价单标题（可选，默认「竞品对比配单（外店名）」）',
          },
          competitorTotal: {
            type: 'number',
            description: '外店报价单上的合计金额（可选，用于计算差价）',
          },
          preferBrand: { type: 'string', description: '优先匹配的品牌（可选，如 Aqara、小米）' },
          items: {
            type: 'array',
            description: '外店报价单的设备明细（不含服务项）',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: '品名（如 智能开关三键、电动窗帘电机、人体存在传感器）',
                },
                brand: { type: 'string', description: '品牌（可选）' },
                model: { type: 'string', description: '型号 / 规格（可选）' },
                deviceType: {
                  type: 'string',
                  description:
                    '设备类型代号（可选，如 switch-3, curtain-track, downlight, motion-sensor）',
                },
                quantity: { type: 'number', description: '数量' },
                unitPrice: { type: 'number', description: '外店单价（元，可选）' },
              },
              required: ['name', 'quantity'],
            },
          },
          fees: {
            type: 'array',
            description: '外店报价里的服务项（如安装调试费、线材辅材费）',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '费用名称' },
                amount: { type: 'number', description: '金额（元）' },
              },
              required: ['name', 'amount'],
            },
          },
        },
        required: ['items'],
      },
    },
    {
      name: 'create_or_update_contract',
      title: '合同生成与管理',
      description:
        '为当前关联项目生成合同（若尚无合同则基于最新报价单自动创建），或修改已有合同的金额、工期、质保期、付款分期比例（合计需 100%）、合同条款、签订状态（draft/signed）及各期收款登记。',
      cost: 1,
      permissions: ['contracts:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          quoteId: {
            type: 'string',
            description: '依据的报价单 ID（可选，不传则自动取项目最新报价单）',
          },
          amount: { type: 'number', description: '合同总金额（元，可选）' },
          durationDays: { type: 'number', description: '工期天数（1–365，可选）' },
          warrantyMonths: { type: 'number', description: '质保月数（0–120，可选）' },
          payments: {
            type: 'array',
            description: '付款节点列表（各期 percent 合计需为 100）',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: '款项节点名称（如 签约预付款 / 设备到场款 / 验收尾款）',
                },
                percent: { type: 'number', description: '比例（0–100）' },
                received: { type: 'boolean', description: '是否已收款' },
              },
              required: ['name', 'percent'],
            },
          },
          terms: { type: 'string', description: '合同条款正文（可选）' },
          status: {
            type: 'string',
            enum: ['draft', 'signed'],
            description: '合同状态：draft 草稿 / signed 已签订',
          },
        },
      },
    },
    {
      name: 'get_document_links',
      title: '打印与导出文档',
      description:
        '获取当前项目所有可打印/导出 PDF 文档的直达链接（点位图、点位交底清单、报价单、合同、方案演示与已启用插件的工程单据），支持指定风格与模板。',
      cost: 0.2,
      permissions: ['documents:read'],
      scope: 'project',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          style: {
            type: 'string',
            enum: ['qixu', 'business', 'oriental', 'tech', 'noir', 'grove', 'minimal'],
            description:
              '文档风格：qixu 栖序雅致 / business 商务蓝 / oriental 东方雅韵 / tech 科技 / noir 墨金臻选 / grove 原木自然 / minimal 简约',
          },
          template: {
            type: 'string',
            description:
              '方案模板标识（如 qixu, noir, grove, quick, azure, mono, dawn, jade, construction）',
          },
        },
      },
    },
    {
      name: 'plan_points_with_vision',
      title: '视觉智能布点',
      description:
        '对当前项目已上传的户型图，调用视觉大模型看图，并按平台设计规范规划智能设备点位：全屋 WiFi（ap-node / ceiling-ap / network-panel）、窗帘电轨 curtain-track、智能网关 gateway、VRF 控制器 vrf-controller、人体传感器 motion-sensor、智能音箱 speaker、中控屏 touch-panel、摄像头 camera，以及门磁 contact-sensor、水浸 water-sensor、烟感 smoke-sensor。开关、插座、灯具只照图识别，本工具不会生成。用户说「帮我规划/补齐/布置 AP、窗帘、传感器、摄像头」「按户型把智能设备点位布好」时调用；重复调用会先替换上次规划的点位。',
      cost: 2,
      permissions: ['point-map:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          deviceTypes: {
            type: 'array',
            items: { type: 'string' },
            description:
              '要规划的设备类型代号（留空 = 按规范规划全部默认智能设备），如 ["ap-node","curtain-track","motion-sensor"]',
          },
          rooms: {
            type: 'array',
            items: { type: 'string' },
            description: '只规划这些房间（留空 = 全屋），如 ["主卧","客厅"]',
          },
          sheetName: {
            type: 'string',
            description: '多张图纸时指定图纸名称（留空 = 全部已上传图纸，最多 3 张）',
          },
          requirements: {
            type: 'string',
            description: '客户的额外要求，如「老人房加人体传感器」「全屋 AP 用吸顶款」',
          },
          replacePlanned: {
            type: 'boolean',
            description: '是否先移除本工具之前规划的点位再重新规划（默认 true）',
          },
        },
      },
    },
    {
      name: 'generate_image',
      title: 'AI 生图',
      description:
        '根据文字描述生成智能家居场景图、方案配图、效果图或材质意向图。用户说“画一张”“生成图片”“出个效果图”时调用。用户上传了参考图并希望据此出图时设 useAttachedImage=true：平台会先由视觉模型理解参考图再写提示词生成，生成后再由视觉模型质检。',
      cost: 0,
      permissions: ['images:generate'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片描述，包含空间、风格、材质、光线、镜头' },
          size: {
            type: 'string',
            enum: ['1024*1024', '1536*1024', '1024*1536'],
            description: '输出尺寸，默认 1024*1024；横版效果图用 1536*1024',
          },
          useAttachedImage: {
            type: 'boolean',
            description: '是否参考本轮对话里用户上传的图片（户型图 / 实景照片 / 效果图）',
          },
        },
        required: ['prompt'],
      },
    },
  ],
}
