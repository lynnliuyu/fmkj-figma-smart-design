/**
 * 点位标记（画布、方案、图例共用的设备图标）。
 *
 * 每个设备类型一个 64×64 的 SVG（public/point-markers/<设备类型>.svg），由
 * scripts/build-point-markers.mjs 生成：类别色底 + 白色图形 + 白色外圈。
 * 墙面安装的设备（开关、插座、面板、门锁）用圆角方形，其余用圆形；开关直接画出键数。
 * 改设计时修改脚本后重新生成，并把 MARKER_VERSION 加一，让浏览器重新加载。
 */
export const MARKER_VERSION = 2

export const markerUrl = (type: string) => `/point-markers/${type}.svg?v=${MARKER_VERSION}`

/** Excalidraw 文件 ID：同一类型的点位共用一个文件 */
export const markerFileId = (type: string) => `mk${MARKER_VERSION}-${type}`

export const isMarkerFileId = (id: unknown): id is string =>
  typeof id === 'string' && /^mk\d+-/.test(id)

/** 空白图纸（AI 新建或示例项目的占位底图），存储时指向 public/blank-sheet.svg */
export const BLANK_SHEET_FILE_ID = 'blank-sheet'
export const BLANK_SHEET_URL = '/blank-sheet.svg'
