'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormFields } from '@payloadcms/ui'

const W = 1440
const H = 960

/**
 * 后台「方案模板」编辑页顶部的实时预览：直接嵌入公开模板库的示例样张（/templates/[slug]/slides），
 * 封面与各章节都是按当前模板定义实时渲染的，保存后刷新即可看到效果，不需要人工截图。
 */
export function TemplatePreviewField() {
  const slug = useFormFields(([fields]) =>
    typeof fields?.slug?.value === 'string' ? fields.slug.value.trim() : '',
  )
  const framework = useFormFields(([fields]) =>
    typeof fields?.framework?.value === 'string' ? fields.framework.value : 'full',
  )
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => el.clientWidth && setScale(el.clientWidth / W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const box: React.CSSProperties = {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--theme-elevation-50)',
  }
  const link: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--theme-elevation-800)',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  }

  return (
    <div style={{ margin: '4px 0 24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>实时预览</div>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            用示例别墅项目实时渲染{framework === 'construction' ? '施工交底' : '这份模板'}
            ；修改后点右上角「保存」，再点「刷新预览」即可看到效果。
          </div>
        </div>
        {slug ? (
          <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setVersion((v) => v + 1)}
              style={{ ...link, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
            >
              刷新预览
            </button>
            <a
              href={`/templates/${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noreferrer"
              style={link}
            >
              打开完整样张 ↗
            </a>
          </div>
        ) : null}
      </div>
      <div
        ref={boxRef}
        style={{ ...box, position: 'relative', width: '100%', aspectRatio: `${W} / ${H}` }}
      >
        {slug ? (
          <iframe
            key={`${slug}-${version}`}
            title="模板预览"
            src={`/templates/${encodeURIComponent(slug)}/slides?v=${version}`}
            loading="lazy"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: W,
              height: H,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              color: 'var(--theme-elevation-500)',
            }}
          >
            填写「标识」并保存后显示预览
          </div>
        )}
      </div>
    </div>
  )
}
