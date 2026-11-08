import Image from 'next/image'

import { cn } from '@/lib/utils'

import { brandSrc, LANDING_BRANDS } from './brand-logos'
import { Section, SectionHeader } from './section'

/** 手机上只放前 11 个标识，加上「共 N 个品牌」正好排满 4 行 */
const MOBILE_LOGOS = 11

/** 产品库：品牌墙（浅色主题用原色标识，深色主题用白色单色版），数量来自产品库。 */
export function LibrarySection({ products, brands }: { products: number; brands: number }) {
  return (
    <Section id="library" labelledBy="library-title">
      <SectionHeader id="library-title" title={`${products} 款在售产品，一键选好型号`}>
        布好点位后，按主平台和「经济 / 标准 / 高端」档次一键配好默认型号，报价里再逐行调整。
      </SectionHeader>
      <ul
        aria-label="产品库中的部分品牌"
        className="mt-14 grid grid-cols-3 border-t border-l border-border sm:grid-cols-5 lg:grid-cols-7"
      >
        {LANDING_BRANDS.map((b, i) => (
          <li
            key={b.slug}
            className={cn(
              'flex h-20 items-center justify-center border-r border-b border-border px-5 sm:h-24',
              i >= MOBILE_LOGOS && 'max-sm:hidden',
            )}
          >
            <Image
              src={brandSrc(b.slug, 'color')}
              alt={b.name}
              width={b.width}
              height={b.height}
              unoptimized
              className="max-h-7 w-auto max-w-full object-contain opacity-75 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0 dark:hidden"
            />
            <Image
              src={brandSrc(b.slug, 'mono')}
              alt={b.name}
              width={b.width}
              height={b.height}
              unoptimized
              className="hidden max-h-7 w-auto max-w-full object-contain opacity-70 transition-opacity hover:opacity-100 dark:block"
            />
          </li>
        ))}
        <li className="col-span-1 flex h-20 items-center justify-center border-r border-b border-border px-3 text-center text-xs leading-relaxed text-muted-foreground sm:col-span-4 sm:h-24 lg:col-span-2">
          共 {brands} 个品牌、{products} 款在售产品
        </li>
      </ul>
    </Section>
  )
}
