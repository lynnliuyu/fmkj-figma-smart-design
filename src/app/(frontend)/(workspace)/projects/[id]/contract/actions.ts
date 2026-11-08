'use server'

import { appAuth } from '@/lib/app-auth'
import type { ContractStatus } from '@/lib/contracts'
import {
  createContractFromQuote,
  deleteContractById,
  saveContractInput,
  setContractStatusFor,
  type ContractInput,
  type ContractResult,
} from '@/lib/services/contract-service'

export type { ContractInput }

/** 合同的业务规则在 src/lib/services/contract-service.ts，网页和微信小程序共用。 */
const expired = { ok: false as const, error: '登录已过期，请重新登录' }

export async function createContract(
  projectId: string,
  quoteId: string,
): Promise<ContractResult<{ id: string }>> {
  const user = await appAuth.getCurrentUser()
  return user ? createContractFromQuote(user, projectId, quoteId) : expired
}

export async function saveContract(id: string, input: ContractInput): Promise<ContractResult> {
  const user = await appAuth.getCurrentUser()
  return user ? saveContractInput(user, id, input) : expired
}

export async function setContractStatus(
  id: string,
  status: ContractStatus,
  signedAt?: string,
): Promise<ContractResult> {
  const user = await appAuth.getCurrentUser()
  return user ? setContractStatusFor(user, id, status, signedAt) : expired
}

export async function deleteContract(id: string): Promise<ContractResult> {
  const user = await appAuth.getCurrentUser()
  return user ? deleteContractById(user, id) : expired
}
