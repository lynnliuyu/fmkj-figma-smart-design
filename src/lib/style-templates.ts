/** 户型图风格化模板：只作为风格参考，不改变源户型布局。 */
export type StyleTemplate = {
  id: string
  name: string
  description: string
  file: string
  prompt: string
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'warm-wood',
    name: '暖木精装',
    description: '米白墙面、浅木地板、克制家具与柔和阴影',
    file: '/style-templates/style-01.jpg',
    prompt: '米白墙面、浅木地板、奶油色家具、柔和自然光，精装修家具彩平图',
  },
  {
    id: 'grey-white',
    name: '灰白手绘',
    description: '灰白家具、轻手绘线稿、干净留白',
    file: '/style-templates/style-02.jpg',
    prompt: '灰白家具、浅灰地面、轻手绘线稿质感、干净留白',
  },
  {
    id: 'black-white',
    name: '黑白线稿',
    description: '黑白平面、极简家具、图纸感',
    file: '/style-templates/style-03.jpg',
    prompt: '黑白线稿、浅灰家具、极简图纸感',
  },
  {
    id: 'warm-grey',
    name: '暖灰轻奢',
    description: '暖灰底、细腻家具、轻奢质感',
    file: '/style-templates/style-04.jpg',
    prompt: '暖灰地面、米色家具、细腻材质与柔和阴影，轻奢精装彩平',
  },
  {
    id: 'wood-light',
    name: '木色通透',
    description: '大面积木色、自然采光、通透空间',
    file: '/style-templates/style-05.jpg',
    prompt: '大面积浅木色、自然采光、通透空间、绿植点缀',
  },
  {
    id: 'blue-grey',
    name: '蓝灰渲染',
    description: '蓝灰调渲染、精细家具、STHAAYI 风格',
    file: '/style-templates/style-06.jpg',
    prompt: '蓝灰调背景、精细家具线稿、柔和阴影、建筑渲染感',
  },
  {
    id: 'beige-line',
    name: '米灰线稿',
    description: '米灰底、细线家具、轻渲染',
    file: '/style-templates/style-07.jpg',
    prompt: '米灰底、细线家具、轻渲染、克制配色',
  },
  {
    id: 'grey-3d',
    name: '3D 灰模',
    description: '立体灰模、浅阴影、体块感',
    file: '/style-templates/style-08.jpg',
    prompt: '立体灰模、浅灰材质、柔和投影、体块感',
  },
  {
    id: 'cream-sketch',
    name: '奶油手绘',
    description: '奶油底色、手绘家具、温柔氛围',
    file: '/style-templates/style-09.jpg',
    prompt: '奶油底色、手绘家具、柔和线条、温柔氛围',
  },
  {
    id: 'warm-light',
    name: '暖光渲染',
    description: '暖光、深色背景、灯光氛围',
    file: '/style-templates/style-10.jpg',
    prompt: '暖光渲染、深色背景、灯光氛围、精致家具',
  },
]

export const styleTemplateById = (id: string) => STYLE_TEMPLATES.find((t) => t.id === id) ?? null

/**
 * 「带图跳转」的交接键：点位图编辑器 → 户型图风格化。
 *
 * 为什么走 sessionStorage 而不是 URL query：
 * 画布底图在客户端是 **dataURL（base64）**，一张 3:2 的图纸动辄几百 KB ~ 数 MB，
 * 放进 query 会撞上 URL 长度上限（各浏览器约 2KB~64KB）并被日志/Referer 泄露。
 * sessionStorage 同源、随标签页生命周期、不落盘。
 */
export const STYLE_TRANSFER_HANDOFF_KEY = 'fmkj:style-transfer-source'

export type StyleTransferHandoff = { image: string; name: string }
