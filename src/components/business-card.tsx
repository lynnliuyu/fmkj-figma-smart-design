/* eslint-disable @next/next/no-img-element --
 * 名片是 1080×648 的印刷画布，每个 logo 的像素宽度（240 / 260 / 300 / 360px）是版式的一部分：
 * next/image 会改写 src、按容器出多套尺寸，还会包一层定位样式，导出的 PNG 就和预览对不上了。
 * 另外导出流程要先把这些 <img> 全部转成 data URL 再截图。见下方组件注释。 */
import {
  CARD_ASSETS,
  CARD_H,
  CARD_W,
  type CardAssets,
  type CardInfo,
  type CardSide,
  type CardStyle,
  type CardVariant,
} from '@/lib/business-card'

/**
 * 名片画布：按 CARD_W × CARD_H（1080×648）真实像素排版。
 * 页面里用 ScaledFrame 缩放显示，导出时直接截这张原始节点。
 *
 * ⚠️ 这个文件里有大量内联 style —— 是**故意**的，不是没守约定：
 * 尺寸全部是印刷像素，颜色来自 CardStyle 变量的数据（切换版式时整张换色），
 * 用 Tailwind 类表达不了「把数据驱动的渐变喂给 background」。
 * 同理这里是画布而不是常规页面，不套 Astryx 组件（组件自带响应式和 token 缩放，
 * 会随窗口变化，印出来和预览对不上）。
 *
 * `<img>` 而不是 `next/image` 也是故意的（eslint 的 no-img-element 警告是预期的）：
 * next/image 会改写 src、按容器出多套尺寸，而这里每个 logo 的像素宽度是版式的一部分
 * （260 / 300 / 360px），外加上面的导出流程要先把 <img> 全部转成 data URL 再截图。
 */

function Decor({ style }: { style: CardStyle }) {
  if (style.decor === 'none') return null
  if (style.decor === 'grid') {
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.05) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(120% 100% at 100% 0%, #000 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 100% at 100% 0%, #000 20%, transparent 75%)',
        }}
      />
    )
  }
  if (style.decor === 'stars') {
    // 星点用固定布局（不用随机数，导出/开发两次渲染一致）
    const stars = [
      [812, 74, 3],
      [930, 132, 2],
      [1004, 68, 2],
      [880, 214, 2],
      [1016, 246, 3],
      [760, 286, 2],
      [984, 352, 2],
      [846, 384, 1.6],
      [954, 470, 2],
      [700, 92, 1.6],
      [1050, 420, 1.6],
      [640, 470, 1.4],
      [1018, 560, 2],
      [740, 578, 1.4],
    ]
    return (
      <>
        {stars.map(([x, y, r], i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: x,
              top: y,
              width: r! * 2,
              height: r! * 2,
              background: i % 3 === 0 ? style.accent : 'rgba(255,255,255,0.75)',
              opacity: i % 3 === 0 ? 0.9 : 0.5,
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 60% at 78% 18%, rgba(139,92,255,0.16), transparent 70%)',
          }}
        />
      </>
    )
  }
  // arc：右半区一条大弧线，像轨道；裁在右半边，不穿过二维码和文字
  return (
    <div className="absolute inset-y-0 right-0 overflow-hidden" style={{ width: '48%' }}>
      <div
        style={{
          position: 'absolute',
          width: 1200,
          height: 1200,
          borderRadius: '50%',
          border: `1px solid ${style.line}`,
          right: -520,
          top: -430,
          opacity: 0.7,
        }}
      />
    </div>
  )
}

/**
 * 合作生态图标 + 名称：只作为「支持接入」展示，绝不放成认证徽标。
 * 米家给的是品牌方图标，视觉重量比 Apple Home / KNX 大，所以单独放大一点点对齐。
 */
function EcosystemLogos({
  style,
  size = 26,
  assets,
}: {
  style: CardStyle
  size?: number
  assets: CardAssets
}) {
  const items = [
    { src: style.logoWhite ? assets.mijiaWhite : assets.mijia, w: size, h: size, label: '米家' },
    { src: assets.appleHome, w: size * 1.15, h: size, label: 'Apple Home' },
    { src: assets.knx, w: size * 1.9, h: size, label: 'KNX' },
  ]
  return (
    <div className="flex items-center" style={{ gap: 18 }}>
      {items.map((it) => (
        <div key={it.label} className="flex items-center" style={{ gap: 7 }}>
          <img
            src={it.src}
            alt=""
            style={{
              height: it.label === '米家' ? it.h * 1.12 : it.h,
              width: it.label === '米家' ? it.w * 1.12 : it.w,
              objectFit: 'contain',
            }}
          />
          <span
            style={{
              fontSize: size * 0.52,
              letterSpacing: '0.1em',
              color: style.sub,
              opacity: 0.95,
            }}
          >
            {it.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function LogoMark({ src, width }: { src: string; width: number }) {
  return <img src={src} alt="" style={{ width, height: width, display: 'block' }} />
}

function Front({ style, info, assets }: { style: CardStyle; info: CardInfo; assets: CardAssets }) {
  // 深色底一律用白色版 logo；米白/白底用彩色版
  const logoSrc = style.logoWhite ? assets.logoWhite : assets.logo

  if (style.layout === 'center') {
    return (
      <div className="relative flex h-full flex-col items-center justify-center px-20 text-center">
        <Decor style={style} />
        <div className="relative flex flex-col items-center">
          <LogoMark src={logoSrc} width={300} />
          <div className="mt-7 h-px w-24" style={{ background: style.accent }} />
          <p
            className="mt-6 text-[30px] font-semibold tracking-[0.32em]"
            style={{ color: style.ink }}
          >
            {info.company}
          </p>
          <p className="mt-2 text-[15px] tracking-[0.42em]" style={{ color: style.sub }}>
            全屋智能 · 方案设计 · 落地交付
          </p>
          <div className="mt-9">
            <EcosystemLogos style={style} assets={assets} />
          </div>
        </div>
      </div>
    )
  }

  if (style.layout === 'grid') {
    return (
      <div className="relative flex h-full flex-col justify-between px-16 py-14">
        <Decor style={style} />
        <div className="relative flex items-start justify-between">
          <LogoMark src={logoSrc} width={260} />
          <div className="text-right">
            <p className="text-[13px] tracking-[0.34em]" style={{ color: style.accent }}>
              SMART LIVING
            </p>
            <p className="mt-1 text-[13px] tracking-[0.22em]" style={{ color: style.sub }}>
              {new Date().getFullYear()}
            </p>
          </div>
        </div>
        <div className="relative">
          <p
            className="text-[46px] leading-[1.12] font-bold tracking-[-0.01em]"
            style={{ color: style.ink }}
          >
            把智能藏进
            <br />
            每一个空间
          </p>
          <div className="mt-6 flex items-center gap-4">
            <div className="h-px flex-1" style={{ background: style.line }} />
            <EcosystemLogos style={style} size={24} assets={assets} />
          </div>
        </div>
      </div>
    )
  }

  if (style.layout === 'minimal') {
    return (
      <div className="relative flex h-full flex-col justify-between px-16 py-14">
        <Decor style={style} />
        <div className="relative flex items-center justify-between">
          <LogoMark src={logoSrc} width={240} />
          <p className="text-[13px] tracking-[0.3em]" style={{ color: style.sub }}>
            SMART LIVING
          </p>
        </div>
        <div className="relative">
          <p
            className="text-[54px] leading-none font-extrabold tracking-[-0.02em]"
            style={{ color: style.ink }}
          >
            {info.company}
          </p>
          <p className="mt-4 text-[17px] tracking-[0.18em]" style={{ color: style.sub }}>
            全屋智能 · 空间设计 · 交付
          </p>
        </div>
        <div className="relative flex items-end justify-between">
          <EcosystemLogos style={style} size={22} assets={assets} />
          {info.site ? (
            <p className="font-mono text-[15px] tracking-[0.16em]" style={{ color: style.sub }}>
              {info.site}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  // split：左信息 / 右视觉
  return (
    <div className="relative flex h-full">
      <Decor style={style} />
      <div className="relative flex w-[62%] flex-col justify-between py-14 pr-8 pl-16">
        <LogoMark src={logoSrc} width={260} />
        <div>
          <p className="text-[15px] tracking-[0.36em]" style={{ color: style.accent }}>
            全屋智能 · 空间设计
          </p>
          <p
            className="mt-4 text-[58px] leading-[1.05] font-extrabold tracking-[-0.02em]"
            style={{ color: style.ink }}
          >
            {info.company}
          </p>
          <div className="mt-5 h-px w-full" style={{ background: style.line }} />
          <div className="mt-5 flex items-center gap-3 text-[16px]" style={{ color: style.sub }}>
            {info.name ? (
              <>
                <span className="tracking-[0.12em]">{info.name}</span>
                {info.title ? <span style={{ color: style.accent }}>·</span> : null}
              </>
            ) : null}
            <span>{info.title}</span>
          </div>
        </div>
        <EcosystemLogos style={style} assets={assets} />
      </div>
      <div className="relative flex w-[38%] items-center justify-center">
        <div className="absolute inset-y-10 left-0" style={{ width: 1, background: style.line }} />
        {/* 右侧只放图形化装饰：同心圆环 + 一颗星，避免和左上 logo 重复 */}
        <div style={{ position: 'relative', width: 300, height: 300 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1px solid ${style.line}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 46,
              borderRadius: '50%',
              border: `1px solid ${style.line}`,
              opacity: 0.7,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 92,
              borderRadius: '50%',
              border: `1px solid ${style.line}`,
              opacity: 0.45,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 10,
              height: 10,
              marginLeft: -5,
              marginTop: -5,
              borderRadius: '50%',
              background: style.accent,
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 34,
              top: 62,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: style.accent,
              opacity: 0.85,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Back({
  style,
  variant,
  info,
  assets,
}: {
  style: CardStyle
  variant: CardVariant
  info: CardInfo
  assets: CardAssets
}) {
  const qr = (
    <div
      className="flex items-center justify-center"
      style={{
        background: style.qrPlate,
        padding: style.qrPlate === 'transparent' ? 0 : 10,
        borderRadius: 8,
      }}
    >
      <img
        src={info.wechatQr || assets.qr}
        alt="微信二维码"
        style={{ width: 218, height: 218, display: 'block' }}
      />
    </div>
  )

  if (style.layout === 'minimal') {
    return (
      <div className="relative flex h-full flex-col justify-between px-16 py-14">
        <Decor style={style} />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[13px] tracking-[0.34em]" style={{ color: style.accent }}>
              WECHAT
            </p>
            <p className="mt-2 text-[15px]" style={{ color: style.sub }}>
              扫码加我
            </p>
          </div>
          {qr}
        </div>
        <div className="relative flex items-end justify-between gap-10">
          {/* 电话/网站没填就不画那一组：空的 <p> 会把 MOBILE / WEB 两个标签挤在一起 */}
          <div className="flex flex-col gap-2.5">
            {info.phone ? (
              <div>
                <p className="text-[11px] tracking-[0.26em]" style={{ color: style.sub }}>
                  MOBILE
                </p>
                <p
                  className="mt-1 font-mono text-[28px] tracking-[0.04em]"
                  style={{ color: style.ink }}
                >
                  {info.phone}
                </p>
              </div>
            ) : null}
            {info.site ? (
              <div>
                <p className="text-[11px] tracking-[0.26em]" style={{ color: style.sub }}>
                  WEB
                </p>
                <p
                  className="mt-1 font-mono text-[24px] tracking-[0.04em]"
                  style={{ color: style.ink }}
                >
                  {info.site}
                </p>
              </div>
            ) : null}
          </div>
          <div className="text-right">
            <img
              src={variant.back.logoWhite ? assets.logoFullWhite : assets.logoFull}
              alt=""
              style={{ width: 240, marginLeft: 'auto' }}
            />
            <p className="mt-2 text-[13px] tracking-[0.2em]" style={{ color: style.sub }}>
              {[info.name, info.title].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // split：左二维码 + 联系方式，右品牌
  return (
    <div className="relative flex h-full">
      <Decor style={style} />
      <div className="relative flex w-[52%] flex-col justify-between py-14 pr-8 pl-16">
        <div>
          <p className="text-[13px] tracking-[0.34em]" style={{ color: style.accent }}>
            WECHAT · 微信
          </p>
          <div className="mt-4 flex items-center gap-6">
            {qr}
            <div className="flex flex-col gap-3.5">
              {info.phone ? (
                <div>
                  <p className="text-[10.5px] tracking-[0.24em]" style={{ color: style.sub }}>
                    MOBILE
                  </p>
                  <p
                    className="mt-1 font-mono text-[25px] leading-none tracking-[0.03em]"
                    style={{ color: style.ink }}
                  >
                    {info.phone}
                  </p>
                </div>
              ) : null}
              {info.site ? (
                <div>
                  <p className="text-[10.5px] tracking-[0.24em]" style={{ color: style.sub }}>
                    WEB
                  </p>
                  <p
                    className="mt-1 font-mono text-[22px] leading-none tracking-[0.03em]"
                    style={{ color: style.ink }}
                  >
                    {info.site}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {info.name ? (
            <>
              <span className="text-[15px] tracking-[0.14em]" style={{ color: style.ink }}>
                {info.name}
              </span>
              <span className="h-3 w-px" style={{ background: style.line }} />
            </>
          ) : null}
          <span className="text-[13px]" style={{ color: style.sub }}>
            {info.title}
          </span>
        </div>
      </div>
      <div className="relative flex w-[48%] flex-col items-center justify-center">
        <div className="absolute inset-y-10 left-0" style={{ width: 1, background: style.line }} />
        <img
          src={variant.back.logoWhite ? assets.logoFullWhite : assets.logoFull}
          alt=""
          style={{ width: 360 }}
        />
        <p className="mt-5 text-[12px] tracking-[0.3em]" style={{ color: style.sub }}>
          SMART SPACE DESIGN
        </p>
        <div className="mt-7">
          <EcosystemLogos
            style={{ ...style, logoWhite: variant.back.logoWhite }}
            size={20}
            assets={assets}
          />
        </div>
      </div>
    </div>
  )
}

export function BusinessCard({
  variant,
  side,
  info,
  assets = CARD_ASSETS,
  className,
}: {
  variant: CardVariant
  side: CardSide
  info: CardInfo
  assets?: CardAssets
  className?: string
}) {
  const style = side === 'front' ? variant.front : variant.back
  return (
    <div
      className={className}
      style={{
        width: CARD_W,
        height: CARD_H,
        // 印刷安全边：所有内容离裁切线 ≥ 3mm（≈36px），这里再留一点呼吸
        background: style.bg,
        color: style.ink,
        fontFamily:
          "'Inter','PingFang SC','Hiragino Sans GB','Noto Sans SC','Microsoft YaHei',sans-serif",
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {side === 'front' ? (
        <Front style={style} info={info} assets={assets} />
      ) : (
        <Back style={style} variant={variant} info={info} assets={assets} />
      )}
    </div>
  )
}
