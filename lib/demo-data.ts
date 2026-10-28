import type { FallbackProduct } from "./fallback-products"
import type { ProjectRecord } from "./project-workflow"

/**
 * Figma 开发版的演示数据（FMKJ_DEMO_MODE=1）。只用于预览和调整页面，不会写入任何数据库。
 */
export function isDemoMode(): boolean {
  return process.env.FMKJ_DEMO_MODE === "1"
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const daysLater = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

function project(input: Partial<ProjectRecord> & Pick<ProjectRecord, "id" | "name" | "code" | "stage">): ProjectRecord {
  return {
    customer: null,
    phone: null,
    community: null,
    building: null,
    roomNo: null,
    address: null,
    platform: null,
    owner: "本地管理员",
    designer: null,
    budget: null,
    quoteAmount: null,
    risk: "normal",
    riskLevel: "normal",
    riskReason: null,
    dueNote: null,
    nextAction: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
    waitingOn: "none",
    tags: [],
    propertyType: "flat",
    ...input,
  }
}

export const demoProjects: ProjectRecord[] = [
  project({
    id: "00000000-0000-4000-8000-000000000101", code: "FM-2026-001", name: "滨江壹号 12-1801 全屋智能",
    customer: "王先生", phone: "138****6621", community: "滨江壹号", building: "12栋", roomNo: "1801",
    platform: "Apple Home", designer: "李设计", budget: 68000, quoteAmount: 59800, stage: "proposal",
    nextAction: "确认客厅灯光场景方案", nextActionDueAt: daysLater(2), nextActionOwnerName: "李设计",
    waitingOn: "customer", tags: ["高意向"], hasPointMap: true, hasProductSelection: true, hasQuote: true,
    createdAt: daysAgo(12), updatedAt: daysAgo(1),
  }),
  project({
    id: "00000000-0000-4000-8000-000000000102", code: "FM-2026-002", name: "云栖别墅 A7 智能化改造",
    customer: "陈女士", phone: "139****2087", community: "云栖别墅", building: "A7", platform: "米家",
    designer: "张工", budget: 150000, quoteAmount: 142600, stage: "contract", propertyType: "villa",
    risk: "watch", riskLevel: "watch", riskReason: "部分设备到货延迟", nextAction: "合同条款最终确认",
    nextActionDueAt: daysLater(1), nextActionOwnerName: "本地管理员", waitingOn: "vendor",
    tags: ["别墅", "大单"], hasPointMap: true, hasProductSelection: true, hasQuote: true,
    createdAt: daysAgo(25), updatedAt: daysAgo(2),
  }),
  project({
    id: "00000000-0000-4000-8000-000000000103", code: "FM-2026-003", name: "翠湖花园 3-602 新房布线",
    customer: "刘先生", phone: "137****5530", community: "翠湖花园", building: "3栋", roomNo: "602",
    platform: "HomeKit", stage: "measure", nextAction: "上门量房并拍照", nextActionDueAt: daysLater(3),
    nextActionOwnerName: "张工", createdAt: daysAgo(4), updatedAt: daysAgo(0),
  }),
  project({
    id: "00000000-0000-4000-8000-000000000104", code: "FM-2026-004", name: "国贸公寓 2205 灯光升级",
    customer: "赵女士", community: "国贸公寓", roomNo: "2205", platform: "米家", budget: 22000,
    quoteAmount: 19800, stage: "install", risk: "blocked", riskLevel: "blocked",
    riskReason: "客户临时变更开关面板颜色", nextAction: "重新下单面板", nextActionDueAt: daysAgo(1),
    waitingOn: "internal", hasPointMap: true, hasQuote: true, hasContract: true,
    createdAt: daysAgo(40), updatedAt: daysAgo(3),
  }),
  project({
    id: "00000000-0000-4000-8000-000000000105", code: "FM-2026-005", name: "金色家园 8-1102 安防套装",
    customer: "孙先生", community: "金色家园", building: "8栋", roomNo: "1102", platform: "米家",
    quoteAmount: 8600, stage: "acceptance", hasPointMap: true, hasQuote: true, hasContract: true,
    createdAt: daysAgo(60), updatedAt: daysAgo(5),
  }),
  project({
    id: "00000000-0000-4000-8000-000000000106", code: "FM-2026-006", name: "新客户咨询：星河湾样板间",
    customer: "周经理", community: "星河湾", stage: "new", nextAction: "电话回访了解需求",
    nextActionDueAt: daysLater(0), createdAt: daysAgo(1), updatedAt: daysAgo(0),
  }),
]

function product(
  id: number,
  name: string,
  brand: string,
  platform: string,
  category: string,
  sku: string,
  price: number,
  cost: number,
  description: string,
  tags: string[] = [],
): FallbackProduct {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    name, brand, platform, category, sku, unit: "个", price, cost, stock: 20, image: "",
    description, tags, channels: ["门店"], status: "active",
  }
}

export const demoProducts: FallbackProduct[] = [
  product(201, "智能网关 3", "Aqara", "Apple Home", "网关", "AQ-HUB-M3", 799, 520, "多协议网关，支持 Matter 与 Zigbee", ["推荐"]),
  product(202, "无线开关 H1 双键", "Aqara", "Apple Home", "开关面板", "AQ-H1-2", 239, 150, "免布线贴墙开关"),
  product(203, "人体存在传感器 FP2", "Aqara", "Apple Home", "传感器", "AQ-FP2", 499, 330, "毫米波人在感应，支持区域定位", ["热销"]),
  product(204, "智能窗帘电机 C3", "Aqara", "Apple Home", "窗帘", "AQ-C3", 1299, 860, "静音电机，支持轨道一体安装"),
  product(205, "小米智能多模网关 2", "小米", "米家", "网关", "MI-GW2", 299, 190, "蓝牙 Mesh / Zigbee 多模网关"),
  product(206, "米家智能开关 Pro 三开", "小米", "米家", "开关面板", "MI-SW-PRO3", 199, 120, "零火版，可接入场景联动"),
  product(207, "米家智能门锁 M20", "小米", "米家", "门锁", "MI-LOCK-M20", 1599, 1100, "指纹 / 密码 / NFC 多种开锁", ["热销"]),
  product(208, "米家摄像头 3 Pro", "小米", "米家", "安防", "MI-CAM3P", 399, 260, "2.5K 画质，支持人形侦测"),
  product(209, "智能筒灯 7W", "易来", "米家", "灯光", "YL-DL7", 129, 70, "可调色温，支持分组控制"),
  product(210, "Wi-Fi 6 吸顶 AP", "华为", "通用", "网络", "HW-AP-W6", 899, 610, "全屋覆盖，PoE 供电"),
]
