import { fail, mpRoute, ok, readJson } from '@/lib/mp/http'
import {
  deleteContractById,
  saveContractInput,
  type ContractInput,
} from '@/lib/services/contract-service'

/** 保存合同（已签订的合同只更新收款状态）。 */
export const PUT = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const r = await saveContractInput(
    user,
    params.id,
    (await readJson(request)) as unknown as ContractInput,
  )
  return r.ok ? ok() : fail(400, r.error)
})

export const DELETE = mpRoute<{ id: string }>(async ({ user, params }) => {
  const r = await deleteContractById(user, params.id)
  return r.ok ? ok() : fail(400, r.error)
})
