'use client'

import { useSelectedLayoutSegment } from 'next/navigation'
import { Archive, ChevronRight } from 'lucide-react'

import { AiPanelToggle } from '@/components/ai/ai-panel'
import { GuardedLink } from '@/components/guarded-link'
import { ThemeMenu } from '@/components/site-header'
import { Badge } from '@astryxdesign/core/Badge'
import type { ProjectRole } from '@/lib/project-access'
import { PROJECT_SECTIONS, sectionHref } from '@/lib/projects'
import { cn } from '@/lib/utils'

import { ProjectShareDialog } from './project-share-dialog'

/**
 * 项目顶栏：项目名称 + 五个板块（信息、点位、报价、合同、归档）。
 * 替代全局顶栏，桌面端一行 48px；窄屏时板块换到第二行。
 * 有未保存修改时，切换板块会先自动保存（见 leave-guard）。
 */
export function ProjectHeader({
  projectId,
  name,
  demo = false,
  subtitle,
  archived,
  role = 'owner',
  collaboratorCount = 0,
}: {
  projectId: string
  name: string
  demo?: boolean
  subtitle: string
  archived: boolean
  role?: ProjectRole
  collaboratorCount?: number
}) {
  const segment = useSelectedLayoutSegment()
  // 售后维保属于交付阶段，高亮「归档」板块
  const active =
    PROJECT_SECTIONS.find((s) => s.segment === segment)?.key ??
    (segment === 'after-sales' ? 'archive' : 'info')

  return (
    <header className="project-header sticky top-0 z-40 -mx-4 -mt-5 border-b border-border bg-background md:-mx-8 md:-mt-7">
      <div className="flex flex-wrap items-center md:h-12 md:flex-nowrap">
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 pl-3 md:flex-none md:pl-4">
          <GuardedLink
            href="/projects"
            className="hidden shrink-0 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            项目
          </GuardedLink>
          <ChevronRight
            aria-hidden
            className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block"
          />
          <div className="min-w-0 md:max-w-[16rem] xl:max-w-[22rem]">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1
                className="truncate text-sm leading-tight font-semibold text-foreground"
                title={name}
              >
                {name}
              </h1>
              {demo ? (
                <Badge
                  variant="info"
                  className="h-4.5 shrink-0 px-1.5 text-[11px]"
                  label={'示例'}
                />
              ) : null}
            </div>
            {subtitle ? (
              <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex h-12 items-center gap-1.5 pr-3 md:order-last md:ml-auto md:pr-4">
          {role !== 'owner' ? (
            <Badge
              variant={role === 'edit' ? 'neutral' : 'neutral'}
              className="text-xs"
              label={role === 'edit' ? '协作 · 可编辑' : '协作 · 仅查看'}
            />
          ) : null}
          {archived ? <Badge variant="neutral" label={'已归档'} icon={<Archive />} /> : null}
          <ProjectShareDialog
            projectId={projectId}
            projectName={name}
            initialRole={role}
            initialCollaboratorCount={collaboratorCount}
          />
          <AiPanelToggle />
          <ThemeMenu />
        </div>
        <nav
          aria-label="项目板块"
          className="order-last flex h-10 w-full items-stretch overflow-x-auto border-t px-1 [scrollbar-width:none] md:order-none md:ml-6 md:h-full md:w-auto md:border-t-0 md:px-0"
        >
          {PROJECT_SECTIONS.map((s, idx) => {
            const isActive = s.key === active
            return (
              <GuardedLink
                key={s.key}
                href={sectionHref(projectId, s.key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-2 px-3 text-[13px] font-medium transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                  isActive
                    ? 'font-semibold text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-[18px] items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors duration-150',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-fg-secondary ring-1 ring-border ring-inset',
                  )}
                >
                  {idx + 1}
                </span>
                {s.label}
              </GuardedLink>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
