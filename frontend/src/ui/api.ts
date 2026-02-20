import type { StatementDetails, Transaction } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || 'http://localhost:8000'

export type AuthMe = {
  authenticated: boolean
  email?: string
}

export type ParseStatementResponse = {
  transactions: Transaction[]
  statementDetails: StatementDetails
}

type AuthPayload = {
  identifier: string
  password: string
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.headers ?? {}),
    },
  })
  return res
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    const detail = typeof data?.detail === 'string' ? data.detail : null
    if (detail && detail.trim()) return detail
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      const first = data.detail[0]
      if (typeof first?.msg === 'string' && first.msg.trim()) return first.msg
    }
  } catch {
    // ignore JSON parsing issues
  }
  if (res.status === 422) return 'Please check identifier/email and password format.'
  return fallback
}

export async function parseStatement(file: File): Promise<ParseStatementResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await apiFetch('/api/parse/statement', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await extractErrorMessage(res, `Parse failed: ${res.status}`))
  const json = await res.json()
  return {
    transactions: (json.transactions ?? []) as Transaction[],
    statementDetails: (json.statement_details ?? {}) as StatementDetails,
  }
}

export async function categorize(
  transactions: Transaction[],
  merchantOverrides: Record<string, string>,
  savingsAccounts: string[] = []
): Promise<Transaction[]> {
  const res = await apiFetch('/api/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactions,
      merchant_overrides: merchantOverrides,
      savings_accounts: savingsAccounts,
    }),
  })
  if (!res.ok) throw new Error(`Categorize failed: ${res.status}`)
  const json = await res.json()
  return json.transactions as Transaction[]
}

export async function authRegister(payload: AuthPayload): Promise<AuthMe> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await extractErrorMessage(res, `Register failed: ${res.status}`))
  return await res.json()
}

export async function checkIdentifierAvailability(identifier: string): Promise<boolean> {
  const params = new URLSearchParams({ identifier })
  const res = await apiFetch(`/auth/identifier-availability?${params.toString()}`, { method: 'GET' })
  if (!res.ok) throw new Error(await extractErrorMessage(res, `Identifier availability check failed: ${res.status}`))
  const json = await res.json()
  return Boolean(json.available)
}

export async function authLogin(payload: AuthPayload): Promise<AuthMe> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await extractErrorMessage(res, `Login failed: ${res.status}`))
  return await res.json()
}

export async function authLogout(): Promise<void> {
  const res = await apiFetch('/auth/logout', { method: 'POST' })
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`)
}

export async function authMe(): Promise<AuthMe> {
  const res = await apiFetch('/auth/me', { method: 'GET' })
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`)
  return await res.json()
}

export async function getMyCategories(): Promise<string[]> {
  const res = await apiFetch('/api/me/categories', { method: 'GET' })
  if (!res.ok) throw new Error(`Get categories failed: ${res.status}`)
  const json = await res.json()
  return json.categories as string[]
}

export async function putMyCategories(categories: string[]): Promise<string[]> {
  const res = await apiFetch('/api/me/categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories }),
  })
  if (!res.ok) throw new Error(`Save categories failed: ${res.status}`)
  const json = await res.json()
  return json.categories as string[]
}

export async function getMyOverrides(): Promise<Record<string, string>> {
  const res = await apiFetch('/api/me/overrides', { method: 'GET' })
  if (!res.ok) throw new Error(`Get overrides failed: ${res.status}`)
  const json = await res.json()
  return (json.overrides ?? {}) as Record<string, string>
}

export async function putMyOverrides(overrides: Record<string, string>): Promise<Record<string, string>> {
  const res = await apiFetch('/api/me/overrides', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  })
  if (!res.ok) throw new Error(`Save overrides failed: ${res.status}`)
  const json = await res.json()
  return (json.overrides ?? {}) as Record<string, string>
}

export async function resetMyData(): Promise<string[]> {
  const res = await apiFetch('/api/me/reset-data', { method: 'POST' })
  if (!res.ok) throw new Error(`Reset user data failed: ${res.status}`)
  const json = await res.json()
  return json.categories as string[]
}

export async function getMySettings(): Promise<Record<string, string>> {
  const res = await apiFetch('/api/me/settings', { method: 'GET' })
  if (!res.ok) throw new Error(`Get settings failed: ${res.status}`)
  const json = await res.json()
  return (json.settings ?? {}) as Record<string, string>
}

export async function putMySettings(settings: Record<string, string>): Promise<Record<string, string>> {
  const res = await apiFetch('/api/me/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  })
  if (!res.ok) throw new Error(`Save settings failed: ${res.status}`)
  const json = await res.json()
  return (json.settings ?? {}) as Record<string, string>
}
