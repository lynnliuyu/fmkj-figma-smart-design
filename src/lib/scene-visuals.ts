/** 内置场景原图及其独立标注位置；产品图片由项目点位选型实时匹配。 */
export type SceneAnchor = {
  id: string
  label: string
  deviceType: string
  deviceTypes?: string[]
  x: number
  y: number
  labelX: number
  labelY: number
  note?: string
}

export type SceneVisual = {
  key: string
  file: string
  url: string
  label: string
  roomTypes: string[]
  sceneUses: string[]
  width: number
  height: number
  anchors: SceneAnchor[]
}

export const SCENE_VISUALS: SceneVisual[] = [
  {
    key: 'entry-arrival',
    file: '01-entry-arrival.jpg',
    url: '/proposal/scenes/01-entry-arrival.jpg',
    label: '玄关回家',
    roomTypes: ['entrance'],
    sceneUses: ['回家', '离家', '门锁与门磁'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'entry-arrival-1',
        label: '智能门锁',
        deviceType: 'smart-lock',
        x: 0.731,
        y: 0.56,
        labelX: 0.82,
        labelY: 0.6,
        note: '图中入户门黑色智能锁及把手示意，未指定产品型号。',
      },
      {
        id: 'entry-arrival-2',
        label: '门磁位置',
        deviceType: 'contact-sensor',
        x: 0.708,
        y: 0.214,
        labelX: 0.812,
        labelY: 0.27,
        note: '图中门扇上沿左侧可见白色小件，作为门磁位置示意。',
      },
      {
        id: 'entry-arrival-3',
        label: '玄关场景面板',
        deviceType: 'switch-4',
        x: 0.655,
        y: 0.485,
        labelX: 0.544,
        labelY: 0.426,
        note: '图中石材墙上的四键面板，实际场景绑定以客户配置为准。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'entry-arrival-4',
        label: '顶面传感器位',
        deviceType: 'motion-sensor',
        x: 0.576,
        y: 0.05,
        labelX: 0.55,
        labelY: 0.13,
        note: '顶面小圆盘所在区域示意；仅标传感器位，不据外观断言人体或烟感型号。实际设备类型以项目配置为准。',
      },
      {
        id: 'entry-arrival-5',
        label: '玄关筒灯',
        deviceType: 'downlight',
        x: 0.406,
        y: 0.155,
        labelX: 0.325,
        labelY: 0.245,
        note: '图中顶面发光筒灯位置。',
      },
      {
        id: 'entry-arrival-6',
        label: '换鞋区灯带',
        deviceType: 'light-strip',
        x: 0.549,
        y: 0.803,
        labelX: 0.418,
        labelY: 0.87,
        note: '图中悬浮换鞋凳下沿的照明灯带。',
      },
    ],
  },
  {
    key: 'living-lighting',
    file: '02-living-lighting.jpg',
    url: '/proposal/scenes/02-living-lighting.jpg',
    label: '客厅灯光',
    roomTypes: ['living'],
    sceneUses: ['会客', '回家', '灯光分层'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'living-lighting-1',
        label: '客厅筒灯',
        deviceType: 'downlight',
        x: 0.462,
        y: 0.053,
        labelX: 0.355,
        labelY: 0.122,
        note: '图中客厅顶面发光筒灯。',
      },
      {
        id: 'living-lighting-2',
        label: '氛围灯带',
        deviceType: 'light-strip',
        x: 0.79,
        y: 0.08,
        labelX: 0.79,
        labelY: 0.181,
        note: '图中吊顶边缘的连续灯带。',
      },
      {
        id: 'living-lighting-3',
        label: '客厅中控屏',
        deviceType: 'touch-panel',
        x: 0.905,
        y: 0.418,
        labelX: 0.885,
        labelY: 0.298,
        note: '图中电视右侧墙上的独立黑色小屏，未指定产品型号。',
      },
      {
        id: 'living-lighting-4',
        label: '灯光开关',
        deviceType: 'switch-3',
        x: 0.908,
        y: 0.504,
        labelX: 0.906,
        labelY: 0.628,
        note: '图中中控屏下方的三键墙壁开关。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'living-lighting-5',
        label: '窗帘电轨位',
        deviceType: 'curtain-track',
        x: 0.525,
        y: 0.235,
        labelX: 0.568,
        labelY: 0.37,
        note: '窗帘顶部隐蔽轨道区域；电机与轨道型号未展示，以真实选型为准。',
      },
    ],
  },
  {
    key: 'dining-gathering',
    file: '03-dining-gathering.jpg',
    url: '/proposal/scenes/03-dining-gathering.jpg',
    label: '餐厅会客',
    roomTypes: ['dining'],
    sceneUses: ['会客', '用餐', '窗帘与灯光'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'dining-gathering-1',
        label: '餐桌吊灯',
        deviceType: 'pendant-light',
        x: 0.464,
        y: 0.319,
        labelX: 0.46,
        labelY: 0.193,
        note: '图中餐桌上方的线性吊灯。',
      },
      {
        id: 'dining-gathering-2',
        label: '窗帘电轨位',
        deviceType: 'curtain-track',
        x: 0.776,
        y: 0.139,
        labelX: 0.675,
        labelY: 0.104,
        note: '窗帘上沿的隐蔽轨道区域；不据画面断言电机产品型号。',
      },
      {
        id: 'dining-gathering-3',
        label: '餐厅场景面板',
        deviceType: 'switch-2',
        x: 0.945,
        y: 0.48,
        labelX: 0.91,
        labelY: 0.361,
        note: '图中靠窗右侧墙面的双键开关。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'dining-gathering-4',
        label: '餐边柜灯带',
        deviceType: 'light-strip',
        x: 0.3,
        y: 0.42,
        labelX: 0.28,
        labelY: 0.31,
        note: '图中餐边柜开放层板下的连续灯带。',
      },
      {
        id: 'dining-gathering-5',
        label: '餐厅筒灯',
        deviceType: 'downlight',
        x: 0.717,
        y: 0.105,
        labelX: 0.836,
        labelY: 0.075,
        note: '图中餐厅顶面可见筒灯。',
      },
    ],
  },
  {
    key: 'kitchen-safety',
    file: '04-kitchen-safety.jpg',
    url: '/proposal/scenes/04-kitchen-safety.jpg',
    label: '厨房安全',
    roomTypes: ['kitchen'],
    sceneUses: ['厨房照明', '水浸提醒', '安全监测'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'kitchen-safety-1',
        label: '厨房灯光开关',
        deviceType: 'switch-2',
        x: 0.187,
        y: 0.479,
        labelX: 0.185,
        labelY: 0.363,
        note: '图中厨房入口墙面的双键开关。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'kitchen-safety-2',
        label: '顶面传感器位',
        deviceType: 'motion-sensor',
        x: 0.547,
        y: 0.034,
        labelX: 0.619,
        labelY: 0.118,
        note: '顶面小圆盘所在区域示意；仅标传感器位，不据外观断言人体或烟感型号。实际设备类型以项目配置为准。',
      },
      {
        id: 'kitchen-safety-3',
        label: '厨房筒灯',
        deviceType: 'downlight',
        x: 0.368,
        y: 0.084,
        labelX: 0.286,
        labelY: 0.09,
        note: '图中厨房入口上方可见筒灯。',
      },
      {
        id: 'kitchen-safety-4',
        label: '操作台灯带',
        deviceType: 'light-strip',
        x: 0.603,
        y: 0.44,
        labelX: 0.552,
        labelY: 0.354,
        note: '图中吊柜下沿连续照明，照亮操作台。',
      },
      {
        id: 'kitchen-safety-5',
        label: '水浸监测区域',
        deviceType: 'water-sensor',
        x: 0.415,
        y: 0.903,
        labelX: 0.425,
        labelY: 0.803,
        note: '水槽下柜及近地面监测区域。该点为安装区域示意，画面未展示水浸传感器，不代表精确施工位置；实际位置需现场复核。',
      },
    ],
  },
  {
    key: 'bedroom-sleep',
    file: '05-bedroom-sleep.jpg',
    url: '/proposal/scenes/05-bedroom-sleep.jpg',
    label: '卧室睡眠',
    roomTypes: ['bedroom'],
    sceneUses: ['睡眠', '晨起', '床边控制'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'bedroom-sleep-1',
        label: '窗帘电轨位',
        deviceType: 'curtain-track',
        x: 0.455,
        y: 0.229,
        labelX: 0.367,
        labelY: 0.35,
        note: '图中落地帘顶部的隐蔽轨道区域，电机未展示。',
      },
      {
        id: 'bedroom-sleep-2',
        label: '床边场景面板',
        deviceType: 'switch-2',
        x: 0.923,
        y: 0.569,
        labelX: 0.917,
        labelY: 0.46,
        note: '图中右侧床头墙面的双键控制面板，场景功能以客户配置为准。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'bedroom-sleep-3',
        label: '床头阅读灯',
        deviceType: 'wall-light',
        x: 0.868,
        y: 0.416,
        labelX: 0.779,
        labelY: 0.35,
        note: '图中右侧独立阅读壁灯。',
      },
      {
        id: 'bedroom-sleep-4',
        label: '床头氛围灯带',
        deviceType: 'light-strip',
        x: 0.691,
        y: 0.52,
        labelX: 0.65,
        labelY: 0.411,
        note: '图中床头软包背后可见的连续光带。',
      },
      {
        id: 'bedroom-sleep-5',
        label: '顶面传感器位',
        deviceType: 'motion-sensor',
        x: 0.669,
        y: 0.043,
        labelX: 0.613,
        labelY: 0.127,
        note: '顶面小圆盘所在区域示意；仅标传感器位，不据外观断言人体或烟感型号。实际设备类型以项目配置为准。',
      },
    ],
  },
  {
    key: 'kids-room',
    file: '06-kids-room.jpg',
    url: '/proposal/scenes/06-kids-room.jpg',
    label: '儿童房',
    roomTypes: ['kids'],
    sceneUses: ['阅读', '睡眠', '窗帘控制'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'kids-room-1',
        label: '房间灯光开关',
        deviceType: 'switch-2',
        x: 0.11,
        y: 0.462,
        labelX: 0.115,
        labelY: 0.345,
        note: '图中进门侧墙面的双键灯光开关。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'kids-room-2',
        label: '阅读照明位',
        deviceType: 'other-light',
        x: 0.689,
        y: 0.47,
        labelX: 0.741,
        labelY: 0.365,
        note: '图中书桌台灯位置，智能控制或调光能力需按实际灯具配置确认。',
      },
      {
        id: 'kids-room-3',
        label: '窗帘电轨位',
        deviceType: 'curtain-track',
        x: 0.674,
        y: 0.191,
        labelX: 0.72,
        labelY: 0.113,
        note: '图中窗帘上方轨道区域，电机未展示。',
      },
      {
        id: 'kids-room-4',
        label: '顶面传感器位',
        deviceType: 'motion-sensor',
        x: 0.609,
        y: 0.05,
        labelX: 0.56,
        labelY: 0.112,
        note: '顶面小圆盘所在区域示意；仅标传感器位，不据外观断言人体或烟感型号。实际设备类型以项目配置为准。',
      },
      {
        id: 'kids-room-5',
        label: '房间筒灯',
        deviceType: 'downlight',
        x: 0.535,
        y: 0.15,
        labelX: 0.469,
        labelY: 0.23,
        note: '图中床与书桌之间上方的发光筒灯。',
      },
    ],
  },
  {
    key: 'bathroom-care',
    file: '07-bathroom-care.jpg',
    url: '/proposal/scenes/07-bathroom-care.jpg',
    label: '卫浴关怀',
    roomTypes: ['bathroom'],
    sceneUses: ['感应照明', '水浸提醒', '夜间低亮'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'bathroom-care-1',
        label: '卫浴灯光开关',
        deviceType: 'switch-2',
        x: 0.142,
        y: 0.479,
        labelX: 0.14,
        labelY: 0.365,
        note: '图中门边石材墙上的双键开关；非湿区设备安装指引。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'bathroom-care-2',
        label: '镜前照明灯带',
        deviceType: 'light-strip',
        x: 0.383,
        y: 0.24,
        labelX: 0.35,
        labelY: 0.305,
        note: '图中镜面顶部边缘的连续照明。',
      },
      {
        id: 'bathroom-care-3',
        label: '顶面传感器位',
        deviceType: 'motion-sensor',
        x: 0.561,
        y: 0.045,
        labelX: 0.653,
        labelY: 0.123,
        note: '顶面小圆盘所在区域示意；仅标传感器位，不据外观断言人体或烟感型号。实际设备类型以项目配置为准。',
      },
      {
        id: 'bathroom-care-4',
        label: '水浸监测区域',
        deviceType: 'water-sensor',
        x: 0.535,
        y: 0.867,
        labelX: 0.536,
        labelY: 0.752,
        note: '浴室柜下方近地面的监测区域。该点为安装区域示意，画面未展示水浸传感器，不代表精确施工位置；实际位置需现场复核。',
      },
      {
        id: 'bathroom-care-5',
        label: '卫浴筒灯',
        deviceType: 'downlight',
        x: 0.446,
        y: 0.127,
        labelX: 0.42,
        labelY: 0.076,
        note: '图中干区顶面发光筒灯。',
      },
    ],
  },
  {
    key: 'balcony-laundry',
    file: '08-balcony-laundry.jpg',
    url: '/proposal/scenes/08-balcony-laundry.jpg',
    label: '阳台洗衣',
    roomTypes: ['balcony', 'utility'],
    sceneUses: ['水浸提醒', '阳台照明', '家务'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'balcony-laundry-1',
        label: '晾衣设备预留位',
        deviceType: 'other',
        x: 0.524,
        y: 0.07,
        labelX: 0.52,
        labelY: 0.228,
        note: '图中顶面晾衣架区域；电动晾衣机选型和供电需按客户实际配置确认。',
      },
      {
        id: 'balcony-laundry-2',
        label: '阳台灯光开关',
        deviceType: 'switch-2',
        x: 0.792,
        y: 0.48,
        labelX: 0.802,
        labelY: 0.377,
        note: '图中洗衣区右侧墙面双键开关。',
        deviceTypes: ['switch-1', 'switch-2', 'switch-3', 'switch-4'],
      },
      {
        id: 'balcony-laundry-3',
        label: '洗衣区插座',
        deviceType: 'socket',
        x: 0.794,
        y: 0.768,
        labelX: 0.814,
        labelY: 0.65,
        note: '图中右侧墙面可见插座；电气条件以现场复核为准。',
      },
      {
        id: 'balcony-laundry-4',
        label: '水浸监测区域',
        deviceType: 'water-sensor',
        x: 0.675,
        y: 0.884,
        labelX: 0.594,
        labelY: 0.914,
        note: '水槽下柜前近地漏区域。该点为安装区域示意，画面未展示水浸传感器，不代表精确施工位置；实际位置需现场复核。',
      },
      {
        id: 'balcony-laundry-5',
        label: '阳台筒灯',
        deviceType: 'downlight',
        x: 0.542,
        y: 0.167,
        labelX: 0.652,
        labelY: 0.213,
        note: '图中洗衣区顶面发光筒灯。',
      },
    ],
  },
  {
    key: 'study-focus',
    file: '09-study-focus.jpg',
    url: '/proposal/scenes/09-study-focus.jpg',
    label: '书房专注',
    roomTypes: ['study'],
    sceneUses: ['专注', '阅读', '语音控制'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'study-focus-1',
        label: '书房场景面板',
        deviceType: 'touch-panel',
        x: 0.091,
        y: 0.447,
        labelX: 0.157,
        labelY: 0.345,
        note: '图中门边蓝灰墙面上的小型控制面板，未指定型号。',
      },
      {
        id: 'study-focus-2',
        label: '智能音箱位',
        deviceType: 'speaker',
        x: 0.6,
        y: 0.588,
        labelX: 0.653,
        labelY: 0.497,
        note: '图中桌面右侧的小型音箱示意，产品型号以真实清单为准。',
      },
      {
        id: 'study-focus-3',
        label: '阅读照明位',
        deviceType: 'other-light',
        x: 0.576,
        y: 0.431,
        labelX: 0.546,
        labelY: 0.331,
        note: '图中桌面阅读台灯；智能控制能力以实际灯具配置为准。',
      },
      {
        id: 'study-focus-4',
        label: '窗帘电轨位',
        deviceType: 'curtain-track',
        x: 0.682,
        y: 0.148,
        labelX: 0.763,
        labelY: 0.24,
        note: '图中窗帘顶部轨道区域，电机未展示。',
      },
      {
        id: 'study-focus-5',
        label: '顶面传感器位',
        deviceType: 'motion-sensor',
        x: 0.596,
        y: 0.045,
        labelX: 0.545,
        labelY: 0.113,
        note: '顶面小圆盘所在区域示意；仅标传感器位，不据外观断言人体或烟感型号。实际设备类型以项目配置为准。',
      },
      {
        id: 'study-focus-6',
        label: '书柜氛围灯带',
        deviceType: 'light-strip',
        x: 0.272,
        y: 0.315,
        labelX: 0.429,
        labelY: 0.26,
        note: '图中木质书柜层板下方连续照明。',
      },
    ],
  },
  {
    key: 'corridor-night',
    file: '10-corridor-night.jpg',
    url: '/proposal/scenes/10-corridor-night.jpg',
    label: '走廊起夜',
    roomTypes: ['corridor', 'stairs'],
    sceneUses: ['起夜', '人来灯亮', '网络与摄像头'],
    width: 1600,
    height: 900,
    anchors: [
      {
        id: 'corridor-night-1',
        label: '顶面感应位',
        deviceType: 'motion-sensor',
        x: 0.5,
        y: 0.097,
        labelX: 0.465,
        labelY: 0.194,
        note: '图中顶面圆形透镜小件所在的感应位置示意，实际型号以项目配置为准。',
      },
      {
        id: 'corridor-night-2',
        label: '无线 AP',
        deviceType: 'ceiling-ap',
        deviceTypes: ['ceiling-ap', 'ap-node'],
        x: 0.69,
        y: 0.119,
        labelX: 0.7,
        labelY: 0.22,
        note: '图中顶面独立圆角矩形无线设备示意，未指定型号。',
      },
      {
        id: 'corridor-night-3',
        label: '走廊摄像头',
        deviceType: 'camera',
        x: 0.762,
        y: 0.408,
        labelX: 0.853,
        labelY: 0.354,
        note: '图中远端门洞上方可见带镜头的摄像头示意。',
      },
      {
        id: 'corridor-night-4',
        label: '起夜低位灯',
        deviceType: 'wall-light',
        x: 0.803,
        y: 0.773,
        labelX: 0.866,
        labelY: 0.68,
        note: '图中右侧墙脚低位灯，不代表施工安装高度。',
      },
      {
        id: 'corridor-night-5',
        label: '楼梯照明灯带',
        deviceType: 'light-strip',
        x: 0.192,
        y: 0.814,
        labelX: 0.296,
        labelY: 0.682,
        note: '图中楼梯踏步下沿连续光带。',
      },
      {
        id: 'corridor-night-6',
        label: '走廊筒灯',
        deviceType: 'downlight',
        x: 0.331,
        y: 0.089,
        labelX: 0.256,
        labelY: 0.166,
        note: '图中走廊顶面发光筒灯。',
      },
    ],
  },
]

export const sceneVisualByKey = (key: string) =>
  SCENE_VISUALS.find((visual) => visual.key === key) ?? null
export const sceneVisualForRoom = (roomType: string) =>
  SCENE_VISUALS.find((visual) => visual.roomTypes.includes(roomType)) ?? null

/** 全屋场景采用明确的代表空间；房间场景仍以实际房间类型优先。 */
const SCENE_VISUAL_KEYS: Record<string, string> = {
  回家模式: 'entry-arrival',
  离家模式: 'entry-arrival',
  会客模式: 'living-lighting',
  观影模式: 'living-lighting',
  起夜模式: 'corridor-night',
  睡眠模式: 'bedroom-sleep',
  厨房安全: 'kitchen-safety',
  卫生间防水: 'bathroom-care',
  老人看护: 'bedroom-sleep',
  安防报警: 'entry-arrival',
  '全屋 WiFi': 'corridor-night',
  家庭传声: 'study-focus',
}

export function sceneVisualForScene(name: string, roomType?: string) {
  const byName = sceneVisualByKey(SCENE_VISUAL_KEYS[name] ?? '')
  if (byName && (!roomType || !byName.roomTypes.length || byName.roomTypes.includes(roomType))) {
    return byName
  }
  return (roomType ? sceneVisualForRoom(roomType) : null) ?? byName
}

/**
 * 校验外部交付的 SceneVisual JSON 数据结构是否符合免对接直接上传规范：
 * - width / height 推荐 1600×900 (16:9)；
 * - x, y, labelX, labelY 必须在 0.02 ~ 0.98 归一化区间内；
 * - deviceType 必须非空。
 */
export function validateSceneVisualSpec(
  input: unknown,
): { ok: true; visual: SceneVisual } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: '场景配置必须是 JSON 对象' }
  const r = input as Record<string, unknown>
  const key = typeof r.key === 'string' ? r.key.trim() : ''
  const file = typeof r.file === 'string' ? r.file.trim() : ''
  const url =
    typeof r.url === 'string' && r.url.trim()
      ? r.url.trim()
      : file
        ? `/proposal/scenes/${file}`
        : ''
  const label = typeof r.label === 'string' ? r.label.trim() : ''
  const width = Number(r.width ?? 1600)
  const height = Number(r.height ?? 900)
  if (!key || !url || !label) return { ok: false, error: '缺少必填字段 key / file(url) / label' }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 400 || height < 300) {
    return { ok: false, error: `场景「${key}」尺寸无效（推荐 1600×900）` }
  }
  if (!Array.isArray(r.anchors) || r.anchors.length === 0) {
    return { ok: false, error: `场景「${key}」至少需要 1 个设备锚点（anchors）` }
  }
  const anchors: SceneAnchor[] = []
  for (const [idx, rawA] of r.anchors.entries()) {
    if (!rawA || typeof rawA !== 'object')
      return { ok: false, error: `场景「${key}」第 ${idx + 1} 个锚点格式错误` }
    const a = rawA as Record<string, unknown>
    const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : `${key}-${idx + 1}`
    const aLabel = typeof a.label === 'string' ? a.label.trim() : ''
    const deviceType = typeof a.deviceType === 'string' ? a.deviceType.trim() : ''
    const x = Number(a.x)
    const y = Number(a.y)
    const labelX = Number(a.labelX)
    const labelY = Number(a.labelY)
    if (!aLabel || !deviceType) return { ok: false, error: `锚点「${id}」缺少 label 或 deviceType` }
    if (![x, y, labelX, labelY].every((n) => Number.isFinite(n) && n >= 0.01 && n <= 0.99)) {
      return {
        ok: false,
        error: `锚点「${id}」的坐标 (x, y, labelX, labelY) 必须在 0.01 ~ 0.99 之间`,
      }
    }
    const deviceTypes = Array.isArray(a.deviceTypes)
      ? a.deviceTypes.filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
      : undefined
    anchors.push({
      id,
      label: aLabel,
      deviceType,
      ...(deviceTypes?.length ? { deviceTypes } : {}),
      x,
      y,
      labelX,
      labelY,
      ...(typeof a.note === 'string' && a.note.trim() ? { note: a.note.trim() } : {}),
    })
  }
  return {
    ok: true,
    visual: {
      key,
      file: file || url.split('/').pop() || `${key}.jpg`,
      url,
      label,
      roomTypes: Array.isArray(r.roomTypes)
        ? r.roomTypes.filter((t): t is string => typeof t === 'string')
        : [],
      sceneUses: Array.isArray(r.sceneUses)
        ? r.sceneUses.filter((t): t is string => typeof t === 'string')
        : [],
      width,
      height,
      anchors,
    },
  }
}
