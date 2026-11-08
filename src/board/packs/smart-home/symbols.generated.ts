/**
 * 由 scripts/build-board-symbols.mjs 生成，请勿手动修改。
 * 素材：fmkj-board-system 仓库（原图优化，内部使用；对外交付前确认授权）。
 */

/** 资源版本（拼进图片地址，改了生成参数后浏览器会重新加载） */
export const SYMBOL_ASSET_VERSION = 2

/** 每张符号图四周的留白（相对主体长边） */
export const SYMBOL_ASSET_PAD = 0.1

/** 主体尺寸（长边 = 1）：渲染时按主体长边换算，留白 / 光晕在外 */
export const SYMBOL_ASSETS: Record<string, { gw: number; gh: number }> = {
  switch: {
    gw: 0.7062,
    gh: 1,
  },
  socket: {
    gw: 1,
    gh: 0.5985,
  },
  'socket-double': {
    gw: 1,
    gh: 0.6564,
  },
  'socket-usb': {
    gw: 1,
    gh: 0.3163,
  },
  downlight: {
    gw: 1,
    gh: 0.9688,
  },
  spotlight: {
    gw: 0.8367,
    gh: 1,
  },
  'track-light': {
    gw: 1,
    gh: 0.0415,
  },
  'ceiling-light': {
    gw: 1,
    gh: 0.9899,
  },
  'pendant-light': {
    gw: 1,
    gh: 0.9894,
  },
  'wall-light': {
    gw: 1,
    gh: 0.5119,
  },
  'panel-light': {
    gw: 1,
    gh: 0.6735,
  },
  'light-strip': {
    gw: 1,
    gh: 0.3492,
  },
  'other-light': {
    gw: 1,
    gh: 0.042,
  },
  'touch-panel': {
    gw: 1,
    gh: 0.7262,
  },
  'motion-sensor': {
    gw: 1,
    gh: 1,
  },
  'smoke-sensor': {
    gw: 1,
    gh: 1,
  },
  'water-sensor': {
    gw: 1,
    gh: 1,
  },
  'temp-sensor': {
    gw: 1,
    gh: 1,
  },
  lock: {
    gw: 0.9945,
    gh: 1,
  },
  doorbell: {
    gw: 1,
    gh: 0.9945,
  },
  camera: {
    gw: 1,
    gh: 1,
  },
  curtain: {
    gw: 0.9945,
    gh: 1,
  },
  hub: {
    gw: 1,
    gh: 1,
  },
  speaker: {
    gw: 1,
    gh: 0.9945,
  },
  router: {
    gw: 1,
    gh: 0.75,
  },
  mesh: {
    gw: 1,
    gh: 1,
  },
  data: {
    gw: 1,
    gh: 1,
  },
  'contact-sensor': {
    gw: 1,
    gh: 1,
  },
  'ac-wall': {
    gw: 1,
    gh: 0.9537,
  },
  other: {
    gw: 0.9074,
    gh: 1,
  },
  'lt-recessed-mount-ceiling-downlight-20cm-8': {
    gw: 1,
    gh: 0.9811,
  },
  'lt-recessed-mount-ceiling-downlight-20cm-8-2': {
    gw: 1,
    gh: 1,
  },
  'lt-surface-mount-ceiling-downlight-20cm-8': {
    gw: 0.9877,
    gh: 1,
  },
  'lt-surface-mount-ceiling-downlight-20cm-8-2': {
    gw: 1,
    gh: 1,
  },
  'lt-recessed-mount-directional-light-20cm-8': {
    gw: 0.8265,
    gh: 1,
  },
  'lt-recessed-mount-directional-light-20cm-8-2': {
    gw: 0.7595,
    gh: 1,
  },
  'lt-surface-mount-directional-light-20cm-8': {
    gw: 0.8393,
    gh: 1,
  },
  'lt-surface-mount-directional-light-20cm-8-2': {
    gw: 0.8387,
    gh: 1,
  },
  'lt-track-light-100cm-40': {
    gw: 1,
    gh: 0.0415,
  },
  'lt-track-light-150cm-59': {
    gw: 1,
    gh: 0.0279,
  },
  'lt-track-light-200cm-79': {
    gw: 1,
    gh: 0.0226,
  },
  'lt-track-light-250cm-98': {
    gw: 1,
    gh: 0.0158,
  },
  'lt-track-light-300cm-118': {
    gw: 1,
    gh: 0.0158,
  },
  'lt-track-light-350cm-138': {
    gw: 1,
    gh: 0.0136,
  },
  'lt-track-light': {
    gw: 0.3095,
    gh: 1,
  },
  'lt-recessed-magnetic-track-light-200cm-79': {
    gw: 1,
    gh: 0.0294,
  },
  'lt-recessed-magnetic-track-light-300cm-118': {
    gw: 1,
    gh: 0.0181,
  },
  'lt-recessed-magnetic-track-light-400cm-157': {
    gw: 1,
    gh: 0.0136,
  },
  'lt-magnetic-spot-light-30cm-12': {
    gw: 1,
    gh: 0.1205,
  },
  'lt-magnetic-spot-light-60cm-24': {
    gw: 1,
    gh: 0.0552,
  },
  'lt-magnetic-spot-light-90cm-35': {
    gw: 1,
    gh: 0.037,
  },
  'lt-magnetic-spot-light-120cm-47': {
    gw: 1,
    gh: 0.0279,
  },
  'lt-linear-pendant-light-81cm-32': {
    gw: 1,
    gh: 0.0816,
  },
  'lt-linear-pendant-light-102cm-40': {
    gw: 1,
    gh: 0.0658,
  },
  'lt-linear-pendant-light-122cm-48': {
    gw: 1,
    gh: 0.055,
  },
  'lt-linear-pendant-light-142cm-56': {
    gw: 1,
    gh: 0.0469,
  },
  'lt-linear-pendant-light-183cm-72': {
    gw: 1,
    gh: 0.0366,
  },
  'lt-t5-light-30cm-12': {
    gw: 1,
    gh: 0.1757,
  },
  'lt-t5-light-60cm-24': {
    gw: 1,
    gh: 0.0897,
  },
  'lt-t5-light-90cm-36': {
    gw: 1,
    gh: 0.0558,
  },
  'lt-t5-light-120cm-48': {
    gw: 1,
    gh: 0.042,
  },
  'lt-led-light': {
    gw: 1,
    gh: 0.3492,
  },
  'lt-pendant-light-76cm-30': {
    gw: 1,
    gh: 0.9946,
  },
  'lt-chandelier-254cm-100': {
    gw: 1,
    gh: 0.9977,
  },
  'lt-multi-pendant-light-59x13cm-23x5': {
    gw: 1,
    gh: 0.2214,
  },
  'lt-multi-pendant-light-59x13cm-23x5-2': {
    gw: 1,
    gh: 0.2214,
  },
  'lt-multi-pendant-light-89x13cm-35x5': {
    gw: 1,
    gh: 0.1549,
  },
  'lt-multi-pendant-light-89x13cm-35x5-2': {
    gw: 1,
    gh: 0.1596,
  },
  'lt-multi-pendant-light-137x25cm-54x10': {
    gw: 1,
    gh: 0.1871,
  },
  'lt-multi-pendant-light-31cm-12': {
    gw: 1,
    gh: 1,
  },
  'lt-multi-pendant-light-50cm-20': {
    gw: 1,
    gh: 0.9545,
  },
  'lt-multi-pendant-light-66cm-26': {
    gw: 1,
    gh: 0.9739,
  },
  'lt-multi-pendant-light-80cm-32': {
    gw: 1,
    gh: 1,
  },
  'lt-surface-mount-ceiling-light-51cm-20': {
    gw: 0.9918,
    gh: 1,
  },
  'lt-surface-mount-ceiling-light-81cm-32': {
    gw: 1,
    gh: 1,
  },
  'lt-surface-mount-ceiling-light-61x41cm-24x16': {
    gw: 1,
    gh: 0.6735,
  },
  'lt-surface-mount-ceiling-light-71x51cm-28x20': {
    gw: 1,
    gh: 0.7193,
  },
  'lt-surface-mount-ceiling-light-81x61cm-32x24': {
    gw: 1,
    gh: 0.7526,
  },
  'lt-surface-mount-ceiling-light-91x61cm-36x24': {
    gw: 1,
    gh: 0.6697,
  },
  'lt-surface-mount-ceiling-light-111x71cm-44x28': {
    gw: 1,
    gh: 0.6415,
  },
  'lt-surface-mount-ceiling-light-122x31cm-48x12': {
    gw: 1,
    gh: 0.28,
  },
  'lt-surface-mount-ceiling-light-122x41cm-48x16': {
    gw: 1,
    gh: 0.3402,
  },
  'lt-surface-mount-ceiling-light-122x61cm-48x24': {
    gw: 1,
    gh: 0.5034,
  },
  'lt-surface-mount-ceiling-light-122x81cm-48x32': {
    gw: 1,
    gh: 0.6667,
  },
  'lt-wall-light-70x35cm-28x14': {
    gw: 1,
    gh: 0.5118,
  },
  'lt-wall-light-30cm-12': {
    gw: 0.8409,
    gh: 1,
  },
  'lt-wall-light-25x55cm-10x22': {
    gw: 0.4737,
    gh: 1,
  },
  'lt-vanity-light-13x19cm-5x8': {
    gw: 0.6829,
    gh: 1,
  },
  'lt-vanity-light-30x19cm-12x8': {
    gw: 1,
    gh: 0.6265,
  },
  'lt-vanity-light-51x19cm-20x8': {
    gw: 1,
    gh: 0.3821,
  },
  'lt-vanity-light-71x19cm-28x8': {
    gw: 1,
    gh: 0.2749,
  },
  'lt-vanity-light-76x19cm-30x8': {
    gw: 1,
    gh: 0.2582,
  },
  'lt-picture-light-40x16cm-16x6': {
    gw: 1,
    gh: 0.4184,
  },
  'lt-picture-light-50x16cm-20x6': {
    gw: 1,
    gh: 0.3361,
  },
  'lt-picture-light-60x16cm-24x6': {
    gw: 1,
    gh: 0.2828,
  },
  'lt-picture-light-70x16cm-28x6': {
    gw: 1,
    gh: 0.244,
  },
  'lt-picture-light-90x16cm-36x6': {
    gw: 1,
    gh: 0.1907,
  },
  'lt-swing-arm-wall-light-20x500cm-8x20': {
    gw: 0.4386,
    gh: 1,
  },
  'lt-swing-arm-wall-light-25x600cm-10x24': {
    gw: 0.4493,
    gh: 1,
  },
  'lt-recessed-wall-light-12cm-5': {
    gw: 1,
    gh: 0.8588,
  },
  'lt-recessed-wall-light-16cm-6': {
    gw: 1,
    gh: 0.6429,
  },
  'lt-floor-lamp-42cmdi-17di': {
    gw: 1,
    gh: 1,
  },
  'lt-floor-arc-lamp-192x48cm-76x19': {
    gw: 1,
    gh: 0.2579,
  },
  'switch-1': {
    gw: 1,
    gh: 1,
  },
  'switch-2': {
    gw: 1,
    gh: 0.9952,
  },
  'switch-3': {
    gw: 1,
    gh: 1,
  },
  'switch-4': {
    gw: 1,
    gh: 1,
  },
}

export type LightingFamilyDef = {
  id: string
  name: string
  group: string
  /** 计入报价的设备类型 */
  deviceType: string
  /** 线形灯具：可旋转、可改长度 */
  linear: boolean
  /**
   * 尺寸档：id = 存进点位的 symbolId；art = 图形（同款同形的尺寸档共用一张）；
   * sizeCm = [宽, 深]（cm，对应图形的横 / 竖），深为 null 时按图形比例（宽 = 图形长边）
   */
  variants: { id: string; art: string; sizeCm: [number, number | null] | null }[]
}

export const LIGHTING_FAMILIES: LightingFamilyDef[] = [
  {
    id: 'downlight-recessed',
    name: '嵌入式筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    linear: false,
    variants: [
      {
        id: 'lt-recessed-mount-ceiling-downlight-5cm-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [5, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-8cm-3',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [8, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-10cm-4',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [10, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-13cm-5',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [13, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-15cm-6',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [15, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-18cm-7',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [18, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'downlight-recessed-square',
    name: '嵌入式方筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    linear: false,
    variants: [
      {
        id: 'lt-recessed-mount-ceiling-downlight-5cm-2-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [5, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-8cm-3-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [8, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-10cm-4-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [10, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-13cm-5-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [13, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-15cm-6-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [15, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-18cm-7-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [18, null],
      },
      {
        id: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        art: 'lt-recessed-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'downlight-surface',
    name: '明装筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-ceiling-downlight-5cm-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [5, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-8cm-3',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [8, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-10cm-4',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [10, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-13cm-5',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [13, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-15cm-6',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [15, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-18cm-7',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [18, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-20cm-8',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'downlight-surface-square',
    name: '明装方筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-ceiling-downlight-5cm-2-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [5, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-8cm-3-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [8, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-10cm-4-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [10, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-13cm-5-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [13, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-15cm-6-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [15, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-18cm-7-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [18, null],
      },
      {
        id: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        art: 'lt-surface-mount-ceiling-downlight-20cm-8-2',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'spot-recessed',
    name: '嵌入式射灯',
    group: '射灯',
    deviceType: 'spotlight',
    linear: false,
    variants: [
      {
        id: 'lt-recessed-mount-directional-light-5cm-2',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [5, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-8cm-3',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [8, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-10cm-4',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [10, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-13cm-5',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [13, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-15cm-6',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [15, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-18cm-7',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [18, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-20cm-8',
        art: 'lt-recessed-mount-directional-light-20cm-8',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'spot-recessed-square',
    name: '嵌入式方射灯',
    group: '射灯',
    deviceType: 'spotlight',
    linear: false,
    variants: [
      {
        id: 'lt-recessed-mount-directional-light-5cm-2-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [5, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-8cm-3-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [8, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-10cm-4-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [10, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-13cm-5-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [13, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-15cm-6-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [15, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-18cm-7-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [18, null],
      },
      {
        id: 'lt-recessed-mount-directional-light-20cm-8-2',
        art: 'lt-recessed-mount-directional-light-20cm-8-2',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'spot-surface',
    name: '明装射灯',
    group: '射灯',
    deviceType: 'spotlight',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-directional-light-5cm-2',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [5, null],
      },
      {
        id: 'lt-surface-mount-directional-light-8cm-3',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [8, null],
      },
      {
        id: 'lt-surface-mount-directional-light-10cm-4',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [10, null],
      },
      {
        id: 'lt-surface-mount-directional-light-13cm-5',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [13, null],
      },
      {
        id: 'lt-surface-mount-directional-light-15cm-6',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [15, null],
      },
      {
        id: 'lt-surface-mount-directional-light-18cm-7',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [18, null],
      },
      {
        id: 'lt-surface-mount-directional-light-20cm-8',
        art: 'lt-surface-mount-directional-light-20cm-8',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'spot-surface-square',
    name: '明装方射灯',
    group: '射灯',
    deviceType: 'spotlight',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-directional-light-5cm-2-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [5, null],
      },
      {
        id: 'lt-surface-mount-directional-light-8cm-3-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [8, null],
      },
      {
        id: 'lt-surface-mount-directional-light-10cm-4-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [10, null],
      },
      {
        id: 'lt-surface-mount-directional-light-13cm-5-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [13, null],
      },
      {
        id: 'lt-surface-mount-directional-light-15cm-6-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [15, null],
      },
      {
        id: 'lt-surface-mount-directional-light-18cm-7-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [18, null],
      },
      {
        id: 'lt-surface-mount-directional-light-20cm-8-2',
        art: 'lt-surface-mount-directional-light-20cm-8-2',
        sizeCm: [20, null],
      },
    ],
  },
  {
    id: 'track',
    name: '轨道灯',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: true,
    variants: [
      {
        id: 'lt-track-light-100cm-40',
        art: 'lt-track-light-100cm-40',
        sizeCm: [100, null],
      },
      {
        id: 'lt-track-light-150cm-59',
        art: 'lt-track-light-150cm-59',
        sizeCm: [150, null],
      },
      {
        id: 'lt-track-light-200cm-79',
        art: 'lt-track-light-200cm-79',
        sizeCm: [200, null],
      },
      {
        id: 'lt-track-light-250cm-98',
        art: 'lt-track-light-250cm-98',
        sizeCm: [250, null],
      },
      {
        id: 'lt-track-light-300cm-118',
        art: 'lt-track-light-300cm-118',
        sizeCm: [300, null],
      },
      {
        id: 'lt-track-light-350cm-138',
        art: 'lt-track-light-350cm-138',
        sizeCm: [350, null],
      },
    ],
  },
  {
    id: 'track-head',
    name: '轨道射灯头',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: false,
    variants: [
      {
        id: 'lt-track-light',
        art: 'lt-track-light',
        sizeCm: null,
      },
    ],
  },
  {
    id: 'magnetic-track',
    name: '嵌入式磁吸轨道',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: true,
    variants: [
      {
        id: 'lt-recessed-magnetic-track-light-200cm-79',
        art: 'lt-recessed-magnetic-track-light-200cm-79',
        sizeCm: [200, null],
      },
      {
        id: 'lt-recessed-magnetic-track-light-300cm-118',
        art: 'lt-recessed-magnetic-track-light-300cm-118',
        sizeCm: [300, null],
      },
      {
        id: 'lt-recessed-magnetic-track-light-400cm-157',
        art: 'lt-recessed-magnetic-track-light-400cm-157',
        sizeCm: [400, null],
      },
    ],
  },
  {
    id: 'magnetic-light',
    name: '磁吸灯',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: true,
    variants: [
      {
        id: 'lt-magnetic-spot-light-30cm-12',
        art: 'lt-magnetic-spot-light-30cm-12',
        sizeCm: [30, null],
      },
      {
        id: 'lt-magnetic-spot-light-60cm-24',
        art: 'lt-magnetic-spot-light-60cm-24',
        sizeCm: [60, null],
      },
      {
        id: 'lt-magnetic-spot-light-90cm-35',
        art: 'lt-magnetic-spot-light-90cm-35',
        sizeCm: [90, null],
      },
      {
        id: 'lt-magnetic-spot-light-120cm-47',
        art: 'lt-magnetic-spot-light-120cm-47',
        sizeCm: [120, null],
      },
    ],
  },
  {
    id: 'linear-pendant',
    name: '线性吊灯',
    group: '线性 · 灯带',
    deviceType: 'pendant-light',
    linear: true,
    variants: [
      {
        id: 'lt-linear-pendant-light-81cm-32',
        art: 'lt-linear-pendant-light-81cm-32',
        sizeCm: [81, null],
      },
      {
        id: 'lt-linear-pendant-light-102cm-40',
        art: 'lt-linear-pendant-light-102cm-40',
        sizeCm: [102, null],
      },
      {
        id: 'lt-linear-pendant-light-122cm-48',
        art: 'lt-linear-pendant-light-122cm-48',
        sizeCm: [122, null],
      },
      {
        id: 'lt-linear-pendant-light-142cm-56',
        art: 'lt-linear-pendant-light-142cm-56',
        sizeCm: [142, null],
      },
      {
        id: 'lt-linear-pendant-light-163cm-64',
        art: 'lt-linear-pendant-light-183cm-72',
        sizeCm: [163, null],
      },
      {
        id: 'lt-linear-pendant-light-183cm-72',
        art: 'lt-linear-pendant-light-183cm-72',
        sizeCm: [183, null],
      },
    ],
  },
  {
    id: 't5',
    name: 'T5 灯管',
    group: '线性 · 灯带',
    deviceType: 'other-light',
    linear: true,
    variants: [
      {
        id: 'lt-t5-light-30cm-12',
        art: 'lt-t5-light-30cm-12',
        sizeCm: [30, null],
      },
      {
        id: 'lt-t5-light-60cm-24',
        art: 'lt-t5-light-60cm-24',
        sizeCm: [60, null],
      },
      {
        id: 'lt-t5-light-90cm-36',
        art: 'lt-t5-light-90cm-36',
        sizeCm: [90, null],
      },
      {
        id: 'lt-t5-light-120cm-48',
        art: 'lt-t5-light-120cm-48',
        sizeCm: [120, null],
      },
    ],
  },
  {
    id: 'led-strip',
    name: 'LED 灯带',
    group: '线性 · 灯带',
    deviceType: 'light-strip',
    linear: false,
    variants: [
      {
        id: 'lt-led-light',
        art: 'lt-led-light',
        sizeCm: null,
      },
    ],
  },
  {
    id: 'pendant',
    name: '吊灯',
    group: '吊灯',
    deviceType: 'pendant-light',
    linear: false,
    variants: [
      {
        id: 'lt-pendant-light-13cm-5',
        art: 'lt-pendant-light-76cm-30',
        sizeCm: [13, null],
      },
      {
        id: 'lt-pendant-light-25cm-10',
        art: 'lt-pendant-light-76cm-30',
        sizeCm: [25, null],
      },
      {
        id: 'lt-pendant-light-38cm-15',
        art: 'lt-pendant-light-76cm-30',
        sizeCm: [38, null],
      },
      {
        id: 'lt-pendant-light-51cm-20',
        art: 'lt-pendant-light-76cm-30',
        sizeCm: [51, null],
      },
      {
        id: 'lt-pendant-light-64cm-25',
        art: 'lt-pendant-light-76cm-30',
        sizeCm: [64, null],
      },
      {
        id: 'lt-pendant-light-76cm-30',
        art: 'lt-pendant-light-76cm-30',
        sizeCm: [76, null],
      },
    ],
  },
  {
    id: 'chandelier',
    name: '枝形吊灯',
    group: '吊灯',
    deviceType: 'pendant-light',
    linear: false,
    variants: [
      {
        id: 'lt-chandelier-102cm-40',
        art: 'lt-chandelier-254cm-100',
        sizeCm: [102, null],
      },
      {
        id: 'lt-chandelier-152cm-60',
        art: 'lt-chandelier-254cm-100',
        sizeCm: [152, null],
      },
      {
        id: 'lt-chandelier-203cm-80',
        art: 'lt-chandelier-254cm-100',
        sizeCm: [203, null],
      },
      {
        id: 'lt-chandelier-254cm-100',
        art: 'lt-chandelier-254cm-100',
        sizeCm: [254, null],
      },
    ],
  },
  {
    id: 'multi-pendant-linear',
    name: '多头吊灯（排）',
    group: '吊灯',
    deviceType: 'pendant-light',
    linear: false,
    variants: [
      {
        id: 'lt-multi-pendant-light-59x13cm-23x5',
        art: 'lt-multi-pendant-light-59x13cm-23x5',
        sizeCm: [59, 13],
      },
      {
        id: 'lt-multi-pendant-light-59x13cm-23x5-2',
        art: 'lt-multi-pendant-light-59x13cm-23x5-2',
        sizeCm: [59, 13],
      },
      {
        id: 'lt-multi-pendant-light-89x13cm-35x5',
        art: 'lt-multi-pendant-light-89x13cm-35x5',
        sizeCm: [89, 13],
      },
      {
        id: 'lt-multi-pendant-light-89x13cm-35x5-2',
        art: 'lt-multi-pendant-light-89x13cm-35x5-2',
        sizeCm: [89, 13],
      },
      {
        id: 'lt-multi-pendant-light-137x25cm-54x10',
        art: 'lt-multi-pendant-light-137x25cm-54x10',
        sizeCm: [137, 25],
      },
    ],
  },
  {
    id: 'multi-pendant-round',
    name: '多头吊灯（圆）',
    group: '吊灯',
    deviceType: 'pendant-light',
    linear: false,
    variants: [
      {
        id: 'lt-multi-pendant-light-31cm-12',
        art: 'lt-multi-pendant-light-31cm-12',
        sizeCm: [31, null],
      },
      {
        id: 'lt-multi-pendant-light-50cm-20',
        art: 'lt-multi-pendant-light-50cm-20',
        sizeCm: [50, null],
      },
      {
        id: 'lt-multi-pendant-light-66cm-26',
        art: 'lt-multi-pendant-light-66cm-26',
        sizeCm: [66, null],
      },
      {
        id: 'lt-multi-pendant-light-80cm-32',
        art: 'lt-multi-pendant-light-80cm-32',
        sizeCm: [80, null],
      },
    ],
  },
  {
    id: 'ceiling-round',
    name: '圆形吸顶灯',
    group: '吸顶 · 面板',
    deviceType: 'ceiling-light',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-ceiling-light-23cm-9',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [23, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-25cm-10',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [25, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-28cm-11',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [28, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-30cm-12',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [30, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-33cm-13',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [33, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-36cm-14',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [36, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-38cm-15',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [38, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-41cm-16',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [41, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-43cm-17',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [43, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-46cm-18',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [46, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-48cm-19',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [48, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-51cm-20',
        art: 'lt-surface-mount-ceiling-light-51cm-20',
        sizeCm: [51, null],
      },
    ],
  },
  {
    id: 'ceiling-square',
    name: '方形吸顶灯',
    group: '吸顶 · 面板',
    deviceType: 'ceiling-light',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-ceiling-light-30cm-12-2',
        art: 'lt-surface-mount-ceiling-light-81cm-32',
        sizeCm: [30, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-41cm-16-2',
        art: 'lt-surface-mount-ceiling-light-81cm-32',
        sizeCm: [41, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-51cm-20-2',
        art: 'lt-surface-mount-ceiling-light-81cm-32',
        sizeCm: [51, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-61cm-24',
        art: 'lt-surface-mount-ceiling-light-81cm-32',
        sizeCm: [61, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-71cm-28',
        art: 'lt-surface-mount-ceiling-light-81cm-32',
        sizeCm: [71, null],
      },
      {
        id: 'lt-surface-mount-ceiling-light-81cm-32',
        art: 'lt-surface-mount-ceiling-light-81cm-32',
        sizeCm: [81, null],
      },
    ],
  },
  {
    id: 'ceiling-panel',
    name: '矩形面板灯',
    group: '吸顶 · 面板',
    deviceType: 'panel-light',
    linear: false,
    variants: [
      {
        id: 'lt-surface-mount-ceiling-light-61x41cm-24x16',
        art: 'lt-surface-mount-ceiling-light-61x41cm-24x16',
        sizeCm: [61, 41],
      },
      {
        id: 'lt-surface-mount-ceiling-light-71x51cm-28x20',
        art: 'lt-surface-mount-ceiling-light-71x51cm-28x20',
        sizeCm: [71, 51],
      },
      {
        id: 'lt-surface-mount-ceiling-light-81x61cm-32x24',
        art: 'lt-surface-mount-ceiling-light-81x61cm-32x24',
        sizeCm: [81, 61],
      },
      {
        id: 'lt-surface-mount-ceiling-light-91x61cm-36x24',
        art: 'lt-surface-mount-ceiling-light-91x61cm-36x24',
        sizeCm: [91, 61],
      },
      {
        id: 'lt-surface-mount-ceiling-light-111x71cm-44x28',
        art: 'lt-surface-mount-ceiling-light-111x71cm-44x28',
        sizeCm: [111, 71],
      },
      {
        id: 'lt-surface-mount-ceiling-light-122x31cm-48x12',
        art: 'lt-surface-mount-ceiling-light-122x31cm-48x12',
        sizeCm: [122, 31],
      },
      {
        id: 'lt-surface-mount-ceiling-light-122x41cm-48x16',
        art: 'lt-surface-mount-ceiling-light-122x41cm-48x16',
        sizeCm: [122, 41],
      },
      {
        id: 'lt-surface-mount-ceiling-light-122x61cm-48x24',
        art: 'lt-surface-mount-ceiling-light-122x61cm-48x24',
        sizeCm: [122, 61],
      },
      {
        id: 'lt-surface-mount-ceiling-light-122x81cm-48x32',
        art: 'lt-surface-mount-ceiling-light-122x81cm-48x32',
        sizeCm: [122, 81],
      },
    ],
  },
  {
    id: 'wall-half',
    name: '半圆壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-wall-light-20x10cm-8x4',
        art: 'lt-wall-light-70x35cm-28x14',
        sizeCm: [20, 10],
      },
      {
        id: 'lt-wall-light-30x15cm-12x6',
        art: 'lt-wall-light-70x35cm-28x14',
        sizeCm: [30, 15],
      },
      {
        id: 'lt-wall-light-40x20cm-16x8',
        art: 'lt-wall-light-70x35cm-28x14',
        sizeCm: [40, 20],
      },
      {
        id: 'lt-wall-light-50x25cm-20x10',
        art: 'lt-wall-light-70x35cm-28x14',
        sizeCm: [50, 25],
      },
      {
        id: 'lt-wall-light-70x35cm-28x14',
        art: 'lt-wall-light-70x35cm-28x14',
        sizeCm: [70, 35],
      },
      {
        id: 'lt-wall-light-80x30cm-24x12',
        art: 'lt-wall-light-70x35cm-28x14',
        sizeCm: [80, 30],
      },
    ],
  },
  {
    id: 'wall-round',
    name: '圆罩壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-wall-light-20cm-8',
        art: 'lt-wall-light-30cm-12',
        sizeCm: [20, null],
      },
      {
        id: 'lt-wall-light-25cm-10',
        art: 'lt-wall-light-30cm-12',
        sizeCm: [25, null],
      },
      {
        id: 'lt-wall-light-30cm-12',
        art: 'lt-wall-light-30cm-12',
        sizeCm: [30, null],
      },
    ],
  },
  {
    id: 'wall-slim',
    name: '细杆壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-wall-light-13x28cm-5x11',
        art: 'lt-wall-light-25x55cm-10x22',
        sizeCm: [13, 28],
      },
      {
        id: 'lt-wall-light-15x33cm-6x13',
        art: 'lt-wall-light-25x55cm-10x22',
        sizeCm: [15, 33],
      },
      {
        id: 'lt-wall-light-20x44cm-8x17',
        art: 'lt-wall-light-25x55cm-10x22',
        sizeCm: [20, 44],
      },
      {
        id: 'lt-wall-light-25x55cm-10x22',
        art: 'lt-wall-light-25x55cm-10x22',
        sizeCm: [25, 55],
      },
    ],
  },
  {
    id: 'vanity',
    name: '镜前灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-vanity-light-13x19cm-5x8',
        art: 'lt-vanity-light-13x19cm-5x8',
        sizeCm: [13, 19],
      },
      {
        id: 'lt-vanity-light-30x19cm-12x8',
        art: 'lt-vanity-light-30x19cm-12x8',
        sizeCm: [30, 19],
      },
      {
        id: 'lt-vanity-light-51x19cm-20x8',
        art: 'lt-vanity-light-51x19cm-20x8',
        sizeCm: [51, 19],
      },
      {
        id: 'lt-vanity-light-71x19cm-28x8',
        art: 'lt-vanity-light-71x19cm-28x8',
        sizeCm: [71, 19],
      },
      {
        id: 'lt-vanity-light-76x19cm-30x8',
        art: 'lt-vanity-light-76x19cm-30x8',
        sizeCm: [76, 19],
      },
    ],
  },
  {
    id: 'picture',
    name: '画灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-picture-light-40x16cm-16x6',
        art: 'lt-picture-light-40x16cm-16x6',
        sizeCm: [40, 16],
      },
      {
        id: 'lt-picture-light-50x16cm-20x6',
        art: 'lt-picture-light-50x16cm-20x6',
        sizeCm: [50, 16],
      },
      {
        id: 'lt-picture-light-60x16cm-24x6',
        art: 'lt-picture-light-60x16cm-24x6',
        sizeCm: [60, 16],
      },
      {
        id: 'lt-picture-light-70x16cm-28x6',
        art: 'lt-picture-light-70x16cm-28x6',
        sizeCm: [70, 16],
      },
      {
        id: 'lt-picture-light-80x16cm-32x6',
        art: 'lt-picture-light-90x16cm-36x6',
        sizeCm: [80, 16],
      },
      {
        id: 'lt-picture-light-90x16cm-36x6',
        art: 'lt-picture-light-90x16cm-36x6',
        sizeCm: [90, 16],
      },
    ],
  },
  {
    id: 'swing-arm',
    name: '摇臂壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-swing-arm-wall-light-20x500cm-8x20',
        art: 'lt-swing-arm-wall-light-20x500cm-8x20',
        sizeCm: [20, 51],
      },
      {
        id: 'lt-swing-arm-wall-light-25x600cm-10x24',
        art: 'lt-swing-arm-wall-light-25x600cm-10x24',
        sizeCm: [25, 61],
      },
    ],
  },
  {
    id: 'recessed-wall',
    name: '嵌入式壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    linear: false,
    variants: [
      {
        id: 'lt-recessed-wall-light-12cm-5',
        art: 'lt-recessed-wall-light-12cm-5',
        sizeCm: [12, null],
      },
      {
        id: 'lt-recessed-wall-light-16cm-6',
        art: 'lt-recessed-wall-light-16cm-6',
        sizeCm: [16, null],
      },
    ],
  },
  {
    id: 'floor-lamp',
    name: '落地灯',
    group: '落地灯',
    deviceType: 'other-light',
    linear: false,
    variants: [
      {
        id: 'lt-floor-lamp-42cmdi-17di',
        art: 'lt-floor-lamp-42cmdi-17di',
        sizeCm: [42, 42],
      },
    ],
  },
  {
    id: 'floor-arc-lamp',
    name: '弧形落地灯',
    group: '落地灯',
    deviceType: 'other-light',
    linear: false,
    variants: [
      {
        id: 'lt-floor-arc-lamp-192x48cm-76x19',
        art: 'lt-floor-arc-lamp-192x48cm-76x19',
        sizeCm: [192, 48],
      },
    ],
  },
]
