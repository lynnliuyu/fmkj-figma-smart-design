import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="-m-4 flex h-[calc(100svh-4rem)] items-center justify-center text-sm text-muted-foreground md:-m-8">
      <Loader2 className="mr-2 size-4 animate-spin" />
      正在打开点位图…
    </div>
  )
}
