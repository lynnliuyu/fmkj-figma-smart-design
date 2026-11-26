'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'

export function ShowcaseSheet({
  constructionUrl,
  alt,
  markers,
}: {
  constructionUrl?: string
  alt: string
  markers?: ReactNode
}) {
  const showcaseUrl = constructionUrl?.replace(/-light\.png$/, '-showcase.png')
  const hasShowcase = showcaseUrl !== constructionUrl
  const [stage, setStage] = useState(hasShowcase ? 'showcase' : 'construction')
  const url = stage === 'showcase' ? showcaseUrl : constructionUrl

  return (
    <figure className="relative grid aspect-16/9 place-items-center overflow-hidden rounded-xl ring-1 ring-border">
      {!url || stage === 'missing' ? (
        <figcaption className="px-6 text-center text-foreground">
          点位图暂时无法显示。报价与方案摘要仍可查看。
        </figcaption>
      ) : (
        <section className="absolute inset-y-0 left-[7.8125%] w-[84.375%]" aria-label="点位图预览">
          <Image
            key={url}
            src={url}
            alt={alt}
            fill
            sizes="1200px"
            className="object-contain"
            unoptimized
            loading="eager"
            onError={() => setStage(stage === 'showcase' ? 'construction' : 'missing')}
          />
          {stage === 'construction' ? markers : null}
        </section>
      )}
    </figure>
  )
}
