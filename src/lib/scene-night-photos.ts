/** 夜间场景意向图：只按场景用途选图，不改变项目点位、设备或报价。 */
export type SceneNightPhoto = {
  key: string
  url: string
  alt: string
  width: number
  height: number
}

export const SCENE_NIGHT_PHOTOS = {
  movie: {
    key: 'movie-night',
    url: '/proposal/scenes/11-movie-night.jpg',
    alt: '夜间观影客厅：主灯熄灭，闭合窗帘与低亮度暖色灯带',
    width: 1672,
    height: 941,
  },
  sleep: {
    key: 'bedroom-night',
    url: '/proposal/scenes/12-bedroom-night.jpg',
    alt: '夜间睡眠卧室：闭合窗帘、关闭顶灯与柔和床头间接光',
    width: 1672,
    height: 941,
  },
  night: {
    key: 'corridor-night',
    url: '/proposal/scenes/13-corridor-night.jpg',
    alt: '深夜起夜走廊：关闭顶灯，低位脚灯与楼梯引导光',
    width: 1672,
    height: 941,
  },
} as const satisfies Record<string, SceneNightPhoto>

/** 兼容默认场景名称与常见同义写法，CMS上传的自定义图片由调用处保留。 */
export function nightScenePhotoForScene(name: string): SceneNightPhoto | null {
  if (/观影|影院|电影|movie|cinema/i.test(name)) return SCENE_NIGHT_PHOTOS.movie
  if (/睡眠|入睡|晚安|sleep/i.test(name)) return SCENE_NIGHT_PHOTOS.sleep
  if (/起夜|夜间引导|夜灯|night/i.test(name)) return SCENE_NIGHT_PHOTOS.night
  return null
}
