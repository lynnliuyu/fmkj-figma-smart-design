// Copyright 繁梦空间 (Fanmeng). Local Astryx theme.

/**
 * Fanmeng theme — **已等同于官方 `neutral` 主题**。
 *
 * 2026-11-21：用户拍板「全站统一官方灰调，不要自写品牌色」。这个主题原先
 * extends `butter` 并把所有强调色重指向品牌紫（`#5447df` / `#908ffe`），是全站
 * 最后一处自写品牌色。现在它不再引入任何色相差异，只是官方 neutral 的另一个名字。
 *
 * 保留文件而不是删除，是为了 `astryx-themes.ts`（生成文件）里的主题清单与
 * 用户的本地存储不至于因为少了条目而报错；主题本身已无任何自定义 token。
 */

import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

export const fanmengTheme = defineTheme({
  name: 'fanmeng',
  extends: neutralTheme,
})
