import { PageHeader } from '@/components/page-header'
import { CadEditor } from '@/components/cad/cad-editor'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('CAD 编辑（预览）') }

/** CAD 编辑预览：独立的本地编辑界面，不接项目点位图流程（issue #178）。 */
export default async function CadEditorPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        title="CAD 编辑（预览）"
        description="在浏览器里打开 DXF、查看图层、编辑几何并保存可编辑副本。图纸不上传，也不会外发。"
      />
      <CadEditor />
    </section>
  )
}
