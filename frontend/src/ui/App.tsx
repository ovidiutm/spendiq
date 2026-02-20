import React, { useRef, useState, useEffect } from 'react'
import {
  parseStatement,
  categorize,
  authMe,
  authLogin,
  authRegister,
  checkIdentifierAvailability,
  authLogout,
  getMyCategories,
  putMyCategories,
  getMyOverrides,
  putMyOverrides,
  getMySettings,
  putMySettings,
} from './api'
import type { StatementDetails, Transaction } from './types'
import { loadOverrides, saveOverrides, loadCategories, saveCategories, loadSettings, saveSettings } from './storage'
import Dashboard from './Dashboard'

const DEFAULT_CATEGORIES = [
  'Groceries','Restaurants','Transport','Transport/Fuel','Utilities','Internet/Phone','Shopping',
  'Home/DIY','Subscriptions','Entertainment','Bills','Fees','Taxes/Fees','Loans','Savings','Transfers','Other'
] as const
const DASHBOARD_CACHE_PREFIX = 'expenses-helper.dashboard-cache.v2'
const STATEMENT_DETAILS_CACHE_PREFIX = 'expenses-helper.statement-details-cache.v2'
const LEGACY_DASHBOARD_CACHE_KEY = 'expenses-helper.dashboard-cache.v1'
const LEGACY_STATEMENT_DETAILS_CACHE_KEY = 'expenses-helper.statement-details-cache.v1'
const CATEGORY_ALIAS_MERCHANT = '__CATEGORY_ALIAS__'
const SETTINGS_KEY_SAVINGS_ACCOUNTS = 'savings_accounts'
const SETTINGS_KEY_LANGUAGE = 'language'

function normalizeCategories(cats: string[]): string[] {
  const mapped = cats.map(c => (c === 'Dining' ? 'Restaurants' : c)).map(c => c.trim()).filter(Boolean)
  const unique = Array.from(new Set(mapped))
  if (!unique.includes('Other')) unique.push('Other')
  return unique
}

function modeFromPath(pathname: string): 'landing' | 'anonymous' | 'account' {
  if (pathname.startsWith('/anonymous')) return 'anonymous'
  if (pathname.startsWith('/account')) return 'account'
  return 'landing'
}

function pathForMode(mode: 'landing' | 'anonymous' | 'account', isLoggedIn: boolean): string {
  if (mode === 'landing') return '/mode-selection'
  if (mode === 'anonymous') return '/anonymous/dashboard'
  return isLoggedIn ? '/account/dashboard' : '/account/login'
}

function getDashboardCacheKey(mode: 'anonymous' | 'account', userEmail: string | null): string {
  if (mode === 'anonymous') return `${DASHBOARD_CACHE_PREFIX}.anonymous`
  return `${DASHBOARD_CACHE_PREFIX}.account.${String(userEmail ?? '').toLowerCase()}`
}

function getStatementDetailsCacheKey(mode: 'anonymous' | 'account', userEmail: string | null): string {
  if (mode === 'anonymous') return `${STATEMENT_DETAILS_CACHE_PREFIX}.anonymous`
  return `${STATEMENT_DETAILS_CACHE_PREFIX}.account.${String(userEmail ?? '').toLowerCase()}`
}

function loadDashboardCacheForContext(mode: 'anonymous' | 'account', userEmail: string | null): {
  txs: Transaction[]
  statementDetails: StatementDetails | null
} {
  try {
    const txRaw = sessionStorage.getItem(getDashboardCacheKey(mode, userEmail))
    const detailsRaw = sessionStorage.getItem(getStatementDetailsCacheKey(mode, userEmail))
    const txs = txRaw ? JSON.parse(txRaw) : null
    const statementDetails = detailsRaw ? JSON.parse(detailsRaw) : null

    if (Array.isArray(txs)) {
      return {
        txs,
        statementDetails: statementDetails && typeof statementDetails === 'object' ? statementDetails : null,
      }
    }
  } catch {
    // ignore and fallback below
  }

  // One-time compatibility fallback for previously shared cache keys.
  // Keep it ONLY for anonymous mode to avoid cross-mode leakage.
  if (mode === 'anonymous') {
    try {
      const legacyTxRaw = sessionStorage.getItem(LEGACY_DASHBOARD_CACHE_KEY)
      const legacyDetailsRaw = sessionStorage.getItem(LEGACY_STATEMENT_DETAILS_CACHE_KEY)
      const legacyTxs = legacyTxRaw ? JSON.parse(legacyTxRaw) : null
      const legacyDetails = legacyDetailsRaw ? JSON.parse(legacyDetailsRaw) : null
      if (Array.isArray(legacyTxs)) {
        return {
          txs: legacyTxs,
          statementDetails: legacyDetails && typeof legacyDetails === 'object' ? legacyDetails : null,
        }
      }
    } catch {
      // ignore
    }
  }

  return { txs: [], statementDetails: null }
}

function saveDashboardCacheForContext(
  mode: 'anonymous' | 'account',
  userEmail: string | null,
  txs: Transaction[],
  statementDetails: StatementDetails | null
): void {
  try {
    sessionStorage.setItem(getDashboardCacheKey(mode, userEmail), JSON.stringify(txs))
    if (statementDetails) {
      sessionStorage.setItem(getStatementDetailsCacheKey(mode, userEmail), JSON.stringify(statementDetails))
    } else {
      sessionStorage.removeItem(getStatementDetailsCacheKey(mode, userEmail))
    }
  } catch {
    // ignore cache write errors
  }
}

function clearDashboardCacheForContext(mode: 'anonymous' | 'account', userEmail: string | null): void {
  try {
    sessionStorage.removeItem(getDashboardCacheKey(mode, userEmail))
    sessionStorage.removeItem(getStatementDetailsCacheKey(mode, userEmail))
  } catch {
    // ignore cache remove errors
  }
}

function categoryNameMatches(value: string | null | undefined, target: string): boolean {
  const a = String(value ?? '').trim()
  const b = String(target ?? '').trim()
  if (!a || !b) return false
  if (a === b) return true
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0
}

function makeCategoryAliasKey(oldName: string): string {
  return `${CATEGORY_ALIAS_MERCHANT}||${oldName.trim()}`
}

function extractCategoryAliases(overrides: Record<string, string>): Record<string, string> {
  const aliases: Record<string, string> = {}
  for (const [key, value] of Object.entries(overrides)) {
    const [merchant, oldName] = key.split('||')
    if (merchant !== CATEGORY_ALIAS_MERCHANT) continue
    const from = String(oldName ?? '').trim()
    const to = String(value ?? '').trim()
    if (from && to) aliases[from] = to
  }
  return aliases
}

function applyCategoryAliases(
  txs: Transaction[],
  categories: string[],
  aliases: Record<string, string>
): Transaction[] {
  const categorySet = new Set(categories)
  return txs.map(t => {
    const raw = t.category ?? 'Other'
    let mapped = raw
    for (const [from, to] of Object.entries(aliases)) {
      if (categoryNameMatches(mapped, from)) {
        mapped = to
        break
      }
    }
    if (mapped === 'Dining') mapped = 'Restaurants'
    if (!categorySet.has(mapped) && categorySet.has('Other')) mapped = 'Other'
    return mapped === t.category ? t : { ...t, category: mapped }
  })
}

function inferCategoryAliasesFromExistingData(txs: Transaction[], categories: string[]): Record<string, string> {
  const categorySet = new Set(categories)
  const unknown = Array.from(new Set(txs.map(t => (t.category ?? '').trim()).filter(Boolean).filter(c => !categorySet.has(c))))
  const aliases: Record<string, string> = {}
  for (const oldName of unknown) {
    const oldNorm = oldName.toLowerCase()
    const candidates = categories.filter(c => {
      const cNorm = c.toLowerCase()
      return cNorm.includes(oldNorm) || oldNorm.includes(cNorm)
    })
    if (candidates.length === 1) {
      aliases[oldName] = candidates[0]
    }
  }
  return aliases
}

function normalizeLanguage(raw: string | null | undefined): 'ro' | 'en' {
  return String(raw ?? '').toLowerCase() === 'en' ? 'en' : 'ro'
}

function normalizeIban(value: string): string {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase().trim()
}

function normalizeSavingsAccounts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.map(v => normalizeIban(String(v))).filter(Boolean)))
}

export default function App() {
  type EntryMode = 'landing' | 'anonymous' | 'account'
  const defaultCategories = normalizeCategories(Array.from(DEFAULT_CATEGORIES))
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [txs, setTxs] = useState<Transaction[]>([])
  const [statementDetails, setStatementDetails] = useState<StatementDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [isBuildingDashboard, setIsBuildingDashboard] = useState(false)
  const [isReloadingView, setIsReloadingView] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runInfo, setRunInfo] = useState<string | null>(null)

  const [overrides, setOverrides] = useState<Record<string, string>>(() => loadOverrides())
  const [categories, setCategories] = useState<string[]>(() => normalizeCategories(loadCategories(defaultCategories)))
  const [newCategory, setNewCategory] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authIdentifier, setAuthIdentifier] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [showAuthPassword, setShowAuthPassword] = useState(false)
  const [authFieldErrors, setAuthFieldErrors] = useState<{ identifier: string; password: string; general: string }>({
    identifier: '',
    password: '',
    general: '',
  })
  const [entryMode, setEntryMode] = useState<EntryMode>(() => modeFromPath(window.location.pathname))
  const [resetSignal, setResetSignal] = useState(0)
  const [language, setLanguage] = useState<'ro' | 'en'>(() => normalizeLanguage(loadSettings()[SETTINGS_KEY_LANGUAGE]))
  const [isLanguageSwitching, setIsLanguageSwitching] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>(() => loadSettings())
  const [savingsAccounts, setSavingsAccounts] = useState<string[]>(() =>
    normalizeSavingsAccounts(
      (() => {
        try {
          return JSON.parse(loadSettings()[SETTINGS_KEY_SAVINGS_ACCOUNTS] || '[]')
        } catch {
          return []
        }
      })()
    )
  )

  const t = (ro: string, en: string) => (language === 'ro' ? ro : en)

  const isLoggedIn = !!userEmail
  const isAccountMode = entryMode === 'account'
  const canUseDashboard = entryMode === 'anonymous' || (isAccountMode && isLoggedIn)
  const canResetCategories = canUseDashboard && txs.length > 0 && !loading && !authLoading && !authBusy
  const canReloadView = canUseDashboard && txs.length > 0 && !loading
  const noticeText = error || runInfo
  const isErrorNotice = !!error
  const renderNoticeText = () => {
    if (!noticeText) return ''
    if (isErrorNotice) return noticeText
    const quoted = noticeText.match(/"(.*?)"/)
    if (!quoted) return noticeText
    const full = quoted[0]
    const fileName = quoted[1]
    const idx = noticeText.indexOf(full)
    if (idx < 0) return noticeText
    return (
      <>
        {noticeText.slice(0, idx)}
        {'"'}<strong>{fileName}</strong>{'"'}
        {noticeText.slice(idx + full.length)}
      </>
    )
  }

  const saveOverridesByMode = async (next: Record<string, string>) => {
    if (isAccountMode) {
      if (!isLoggedIn) throw new Error(t('Autentifica-te pentru a salva datele contului.', 'Please login to save account data.'))
      await putMyOverrides(next)
      return
    }
    saveOverrides(next)
  }

  const saveCategoriesByMode = async (next: string[]) => {
    if (isAccountMode) {
      if (!isLoggedIn) throw new Error(t('Autentifica-te pentru a salva datele contului.', 'Please login to save account data.'))
      await putMyCategories(next)
      return
    }
    saveCategories(next)
  }

  const saveSettingsByMode = async (next: Record<string, string>) => {
    if (isAccountMode) {
      if (!isLoggedIn) {
        saveSettings(next)
        return
      }
      await putMySettings(next)
      return
    }
    saveSettings(next)
  }

  const applySettingsState = (nextSettings: Record<string, string>) => {
    setSettings(nextSettings)
    const nextLanguage = normalizeLanguage(nextSettings[SETTINGS_KEY_LANGUAGE])
    setLanguage(nextLanguage)
    const nextSavings = (() => {
      try {
        return normalizeSavingsAccounts(JSON.parse(nextSettings[SETTINGS_KEY_SAVINGS_ACCOUNTS] || '[]'))
      } catch {
        return []
      }
    })()
    setSavingsAccounts(nextSavings)
  }

  const loadAnonymousConfig = () => {
    setOverrides(loadOverrides())
    setCategories(normalizeCategories(loadCategories(defaultCategories)))
    applySettingsState(loadSettings())
  }

  const loadUserConfig = async () => {
    const [remoteOverrides, remoteCategories, remoteSettings] = await Promise.all([
      getMyOverrides(),
      getMyCategories(),
      getMySettings(),
    ])
    setOverrides(remoteOverrides)
    setCategories(normalizeCategories(remoteCategories))
    applySettingsState(remoteSettings)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      setAuthLoading(true)
      try {
        const me = await authMe()
        if (!alive) return
        if (me.authenticated && me.email) {
          setUserEmail(me.email)
          await loadUserConfig()
        } else {
          setUserEmail(null)
          loadAnonymousConfig()
        }
      } catch {
        if (!alive) return
        setUserEmail(null)
        loadAnonymousConfig()
      } finally {
        if (alive) setAuthLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setEntryMode(modeFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const targetPath = pathForMode(entryMode, isLoggedIn)
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ mode: entryMode }, '', targetPath)
    }
  }, [entryMode, isLoggedIn])

  useEffect(() => {
    if (authLoading) return
    if (entryMode === 'anonymous') {
      const cached = loadDashboardCacheForContext('anonymous', null)
      setTxs(cached.txs)
      setStatementDetails(cached.statementDetails)
      return
    }
    if (entryMode === 'account' && isLoggedIn) {
      const cached = loadDashboardCacheForContext('account', userEmail)
      setTxs(cached.txs)
      setStatementDetails(cached.statementDetails)
      return
    }
    setTxs([])
    setStatementDetails(null)
  }, [authLoading, entryMode, isLoggedIn, userEmail])

  useEffect(() => {
    if (authLoading) return
    if (!canUseDashboard) return
    if (entryMode === 'anonymous') {
      saveDashboardCacheForContext('anonymous', null, txs, statementDetails)
      return
    }
    if (entryMode === 'account' && isLoggedIn) {
      saveDashboardCacheForContext('account', userEmail, txs, statementDetails)
    }
  }, [authLoading, canUseDashboard, entryMode, isLoggedIn, userEmail, txs, statementDetails])

  useEffect(() => {
    const onReset = () => setResetSignal(s => s + 1)
    window.addEventListener('expenses-helper-reset-settings', onReset)
    return () => window.removeEventListener('expenses-helper-reset-settings', onReset)
  }, [])

  const recategorizeCurrent = async (nextOverrides: Record<string, string>) => {
    if (!txs.length) return
    const aliases = {
      ...inferCategoryAliasesFromExistingData(txs, categories),
      ...extractCategoryAliases(nextOverrides),
    }
    const categorized = await categorize(txs.map(t => ({ ...t, category: undefined })), nextOverrides, savingsAccounts)
    const normalized = categorized.map(t => ({
      ...t,
      category: t.category === 'Dining' ? 'Restaurants' : t.category,
    }))
    setTxs(applyCategoryAliases(normalized, categories, aliases))
  }

  const runUpload = async (selectedFile: File) => {
    const startedAt = performance.now()
    setIsBuildingDashboard(true)
    setLoading(true); setError(null); setRunInfo(null)
    try {
      const parsed = await parseStatement(selectedFile)
      const categorized = await categorize(parsed.transactions, overrides, savingsAccounts)
      const aliases = {
        ...inferCategoryAliasesFromExistingData(txs, categories),
        ...extractCategoryAliases(overrides),
      }
      const normalized = categorized.map(t => ({
        ...t,
        category: t.category === 'Dining' ? 'Restaurants' : t.category,
      }))
      // Every new statement import starts from default dashboard selections.
      window.dispatchEvent(new Event('expenses-helper-reset-dashboard-view'))
      setTxs(applyCategoryAliases(normalized, categories, aliases))
      setStatementDetails(parsed.statementDetails ?? null)
      const durationMs = Math.round(performance.now() - startedAt)
      const durationSec = (durationMs / 1000).toFixed(2)
      setRunInfo(
        t(
          `Gata. "${selectedFile.name}" procesat in ${durationSec}s (${categorized.length} tranzactii).`,
          `Done. "${selectedFile.name}" processed in ${durationSec}s (${categorized.length} transactions).`
        )
      )
    } catch (e: any) {
      setError(e?.message ?? t('Eroare necunoscuta', 'Unknown error'))
    } finally {
      setLoading(false)
      setIsBuildingDashboard(false)
    }
  }

  useEffect(() => {
    if (!isBuildingDashboard) return
    const prevBodyCursor = document.body.style.cursor
    const prevHtmlCursor = document.documentElement.style.cursor
    document.body.style.cursor = 'progress'
    document.documentElement.style.cursor = 'progress'
    return () => {
      document.body.style.cursor = prevBodyCursor
      document.documentElement.style.cursor = prevHtmlCursor
    }
  }, [isBuildingDashboard])

  const onChooseAndBuild = () => {
    if (isAccountMode && !isLoggedIn) {
      setAuthFieldErrors(prev => ({ ...prev, general: t('Autentifica-te mai intai pentru a folosi modul Cont Utilizator.', 'Please login first to use User Account mode.') }))
      return
    }
    fileInputRef.current?.click()
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    await runUpload(selected)
    e.target.value = ''
  }

  const makeOverrideKey = (merchant: string, type: string) => `${merchant.trim()}||${type.trim()}`
  const makeTransactionOverrideKey = (tx: Transaction) => {
    const amountPart = tx.amount === null ? '' : Number(tx.amount).toFixed(2)
    return `${(tx.merchant ?? '').trim()}||${(tx.title ?? '').trim()}||${(tx.date ?? '').trim()}||${amountPart}`
  }

  const onOverrideMerchant = async (merchant: string, type: string, category: string) => {
    const next = { ...overrides, [makeOverrideKey(merchant, type)]: category }
    setOverrides(next)
    setLoading(true); setError(null)
    try {
      await saveOverridesByMode(next)
      await recategorizeCurrent(next)
    } catch (e: any) {
      setError(e?.message ?? t('Eroare necunoscuta', 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const onOverrideTransaction = async (tx: Transaction, category: string) => {
    const next = { ...overrides, [makeTransactionOverrideKey(tx)]: category }
    setOverrides(next)
    setLoading(true); setError(null)
    try {
      await saveOverridesByMode(next)
      await recategorizeCurrent(next)
    } catch (e: any) {
      setError(e?.message ?? t('Eroare necunoscuta', 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleAddCategory = async () => {
    const c = newCategory.trim()
    if (!c) return
    const normalized = c === 'Dining' ? 'Restaurants' : c
    const next = Array.from(new Set([...categories, normalized]))
    setCategories(next)
    setSelectedCategory(normalized)
    setNewCategory('')
    try {
      await saveCategoriesByMode(next)
    } catch (e: any) {
      setError(e?.message ?? t('Eroare necunoscuta', 'Unknown error'))
    }
  }

  const startRenameCategory = (name: string) => {
    if (name === 'Other') return
    setEditingCategory(name)
    setEditingValue(name)
  }

  const applyRenameCategory = async () => {
    if (!editingCategory) return
    const trimmed = editingValue.trim() === 'Dining' ? 'Restaurants' : editingValue.trim()
    if (!trimmed || trimmed === editingCategory) {
      setEditingCategory(null)
      setEditingValue('')
      return
    }

    const oldName = editingCategory
    const nextCategories = Array.from(new Set(categories.map(c => (categoryNameMatches(c, oldName) ? trimmed : c))))
    const nextOverrides: Record<string, string> = {}
    for (const [k, v] of Object.entries(overrides)) {
      nextOverrides[k] = categoryNameMatches(v, oldName) ? trimmed : v
    }
    nextOverrides[makeCategoryAliasKey(oldName)] = trimmed

    setCategories(nextCategories)
    setSelectedCategory(trimmed)
    setOverrides(nextOverrides)
    setTxs(prev => prev.map(t => (categoryNameMatches(t.category, oldName) ? { ...t, category: trimmed } : t)))
    setEditingCategory(null)
    setEditingValue('')

    try {
      await Promise.all([
        saveCategoriesByMode(nextCategories),
        saveOverridesByMode(nextOverrides),
      ])
      const recategorized = await categorize(txs.map(t => ({ ...t, category: undefined })), nextOverrides, savingsAccounts)
      const aliases = {
        ...inferCategoryAliasesFromExistingData(txs, nextCategories),
        ...extractCategoryAliases(nextOverrides),
      }
      const normalized = recategorized.map(t => ({
        ...t,
        category: categoryNameMatches(t.category, oldName)
          ? trimmed
          : (t.category === 'Dining' ? 'Restaurants' : t.category),
      }))
      setTxs(applyCategoryAliases(normalized, nextCategories, aliases))
    } catch (e: any) {
      setError(e?.message ?? t('Eroare necunoscuta', 'Unknown error'))
    }
  }

  const cancelRenameCategory = () => {
    setEditingCategory(null)
    setEditingValue('')
  }

  const handleDeleteCategory = async (name: string) => {
    if (name === 'Other') return
    const fallback = 'Other'
    const nextCategories = categories.filter(c => !categoryNameMatches(c, name))
    if (!nextCategories.includes(fallback)) nextCategories.push(fallback)

    const nextOverrides: Record<string, string> = {}
    for (const [k, v] of Object.entries(overrides)) {
      nextOverrides[k] = categoryNameMatches(v, name) ? fallback : v
    }
    for (const key of Object.keys(nextOverrides)) {
      const [merchant, oldName] = key.split('||')
      if (merchant === CATEGORY_ALIAS_MERCHANT && categoryNameMatches(oldName, name)) {
        delete nextOverrides[key]
      }
    }

    setCategories(nextCategories)
    setSelectedCategory('')
    setOverrides(nextOverrides)
    setTxs(prev => prev.map(t => (categoryNameMatches(t.category, name) ? { ...t, category: fallback } : t)))
    if (categoryNameMatches(editingCategory, name)) {
      setEditingCategory(null)
      setEditingValue('')
    }

    try {
      await Promise.all([
        saveCategoriesByMode(nextCategories),
        saveOverridesByMode(nextOverrides),
      ])
      const recategorized = await categorize(txs.map(t => ({ ...t, category: undefined })), nextOverrides, savingsAccounts)
      const aliases = {
        ...inferCategoryAliasesFromExistingData(txs, nextCategories),
        ...extractCategoryAliases(nextOverrides),
      }
      const normalized = recategorized.map(t => ({
        ...t,
        category: categoryNameMatches(t.category, name)
          ? fallback
          : (t.category === 'Dining' ? 'Restaurants' : t.category),
      }))
      setTxs(applyCategoryAliases(normalized, nextCategories, aliases))
    } catch (e: any) {
      setError(e?.message ?? t('Eroare necunoscuta', 'Unknown error'))
    }
  }

  const handleAuthAction = async (mode: 'login' | 'register') => {
    const emptyErrors = { identifier: '', password: '', general: '' }
    setAuthBusy(true); setError(null)
    setAuthFieldErrors(emptyErrors)
    try {
      const payload = { identifier: authIdentifier.trim(), password: authPassword }
      if (!payload.identifier || !payload.password) {
        setAuthFieldErrors({
          identifier: payload.identifier ? '' : t('Email/Utilizator este obligatoriu.', 'Email/Username is required.'),
          password: payload.password ? '' : t('Parola este obligatorie.', 'Password is required.'),
          general: '',
        })
        return
      }
      if (mode === 'register') {
        const available = await checkIdentifierAvailability(payload.identifier)
        if (!available) {
          setAuthFieldErrors({
            identifier: t('Acest Email/Utilizator este deja folosit.', 'This Email/Username is already used.'),
            password: '',
            general: '',
          })
          return
        }
      }
      const res = mode === 'login' ? await authLogin(payload) : await authRegister(payload)
      if (!res.authenticated || !res.email) {
        throw new Error(t('Autentificarea a esuat.', 'Authentication failed.'))
      }
      await loadUserConfig()
      setUserEmail(res.email)
      setRunInfo(null)
      setAuthPassword('')
    } catch (e: any) {
      setUserEmail(null)
      const msg = String(e?.message ?? t('Autentificarea a esuat.', 'Authentication failed.'))
      const lower = msg.toLowerCase()
      const nextErrors = { ...emptyErrors }
      if (lower.includes('identifier already registered')) {
        nextErrors.identifier = t('Acest Email/Utilizator este deja folosit.', 'This Email/Username is already used.')
      } else if (lower.includes('identifier is required')) {
        nextErrors.identifier = t('Email/Utilizator este obligatoriu.', 'Email/Username is required.')
      } else if (lower.includes('at least 8 characters')) {
        nextErrors.password = t('Parola trebuie sa aiba cel putin 8 caractere.', 'Password should have at least 8 characters')
      } else if (lower.includes('password')) {
        nextErrors.password = msg
      } else if (lower.includes('invalid email/username or password')) {
        nextErrors.identifier = t('Email/Utilizator sau parola invalide.', 'Invalid Email/Username or Password.')
        nextErrors.password = t('Email/Utilizator sau parola invalide.', 'Invalid Email/Username or Password.')
      } else {
        nextErrors.general = msg
      }
      setAuthFieldErrors(nextErrors)
    } finally {
      setAuthBusy(false)
    }
  }

  const onLogout = async () => {
    setAuthBusy(true)
    try {
      const accountEmail = userEmail
      await authLogout()
      setUserEmail(null)
      setTxs([])
      setStatementDetails(null)
      if (accountEmail) clearDashboardCacheForContext('account', accountEmail)
      if (entryMode === 'anonymous') {
        loadAnonymousConfig()
        setRunInfo(t('Deconectat. Ruleaza in modul anonim local.', 'Signed out. Running in anonymous local mode.'))
      } else {
        setRunInfo(t('Deconectat din contul de utilizator.', 'Signed out from user account.'))
      }
    } catch (e: any) {
      setError(e?.message ?? t('Deconectarea a esuat.', 'Logout failed.'))
    } finally {
      setAuthBusy(false)
    }
  }

  const onResetAppState = async () => {
    const ok = window.confirm(
      t(
        'ATENTIE! Vei pierde toate modificarile pe care le-ai facut legate de categoriile tranzactiilor!\nResetezi categoriile la valorile initiale/implicite?',
        'WARNING! You will lose all changes made to transaction categories!\nReset Categories to initial/default values?'
      )
    )
    if (!ok) return

    setLoading(true); setError(null)
    try {
      const allowedCategories = new Set(defaultCategories)
      const nextOverrides: Record<string, string> = {}
      for (const [k, v] of Object.entries(overrides)) {
        nextOverrides[k] = allowedCategories.has(v) ? v : 'Other'
      }

      setOverrides(nextOverrides)
      setCategories(defaultCategories)
      setSelectedCategory('')
      setNewCategory('')
      setEditingCategory(null)
      setEditingValue('')
      const nextSettings: Record<string, string> = {
        [SETTINGS_KEY_LANGUAGE]: language,
        [SETTINGS_KEY_SAVINGS_ACCOUNTS]: JSON.stringify([]),
      }
      setSettings(nextSettings)
      setLanguage(language)
      setSavingsAccounts([])
      setTxs(prev => prev.map(t => {
        const c = t.category ?? 'Other'
        return allowedCategories.has(c) ? t : { ...t, category: 'Other' }
      }))
      setAuthFieldErrors({ identifier: '', password: '', general: '' })

      if (isAccountMode) {
        if (!isLoggedIn) throw new Error(t('Autentifica-te pentru a reseta categoriile in modul Cont Utilizator.', 'Please login to reset categories in account mode.'))
        await Promise.all([
          putMyCategories(defaultCategories),
          putMyOverrides(nextOverrides),
          putMySettings(nextSettings),
        ])
      } else {
        saveCategories(defaultCategories)
        saveOverrides(nextOverrides)
        saveSettings(nextSettings)
      }

      setRunInfo(t('Categoriile au fost resetate la valorile implicite.', 'Categories reset to default values.'))
    } catch (e: any) {
      setError(e?.message ?? t('Resetarea a esuat.', 'Reset failed.'))
    } finally {
      setLoading(false)
    }
  }

  const onReloadView = async () => {
    if (!txs.length) return
    setError(null)
    try {
      const categorized = await categorize(txs.map(t => ({ ...t, category: undefined })), overrides, savingsAccounts)
      const aliases = {
        ...inferCategoryAliasesFromExistingData(txs, categories),
        ...extractCategoryAliases(overrides),
      }
      const normalized = categorized.map(t => ({
        ...t,
        category: t.category === 'Dining' ? 'Restaurants' : t.category,
      }))
      setTxs(applyCategoryAliases(normalized, categories, aliases))
    } catch (e: any) {
      setError(e?.message ?? t('Reincarcarea a esuat.', 'Reload failed.'))
    }
  }

  const onResetDashboardView = async () => {
    if (!canReloadView || isReloadingView) return
    const minAnimationMs = 1000
    const startedAt = Date.now()
    setError(null)
    setRunInfo(null)
    setIsReloadingView(true)
    let reloadOk = false
    try {
      window.dispatchEvent(new Event('expenses-helper-reset-dashboard-view'))
      await onReloadView()
      reloadOk = true
    } finally {
      const elapsedMs = Date.now() - startedAt
      const remainingMs = minAnimationMs - elapsedMs
      if (remainingMs > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingMs))
      }
      setIsReloadingView(false)
      if (reloadOk) {
        setRunInfo(t('Gata. Dashboard-ul a fost reincarcat cu succes.', 'Done. Dashboard reloaded successfully.'))
      }
    }
  }

  const persistSettings = async (next: Record<string, string>) => {
    setSettings(next)
    try {
      await saveSettingsByMode(next)
    } catch (e: any) {
      setError(e?.message ?? t('Salvarea setarilor a esuat.', 'Save settings failed.'))
      throw e
    }
  }

  const onLanguageChange = async (nextLangRaw: string) => {
    const nextLang = normalizeLanguage(nextLangRaw)
    if (nextLang === language) return
    setError(null)
    setRunInfo(null)
    setIsLanguageSwitching(true)
    const minDelayMs = 1000
    const startedAt = Date.now()
    try {
      const nextSettings = {
        ...settings,
        [SETTINGS_KEY_LANGUAGE]: nextLang,
      }
      await persistSettings(nextSettings)
      const elapsed = Date.now() - startedAt
      const remaining = minDelayMs - elapsed
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining))
      }
      setLanguage(nextLang)
    } finally {
      setIsLanguageSwitching(false)
    }
  }

  const onAddSavingsAccount = async (iban: string) => {
    const normalized = normalizeIban(iban)
    if (!normalized) return
    const nextAccounts = Array.from(new Set([...savingsAccounts, normalized]))
    const nextSettings = {
      ...settings,
      [SETTINGS_KEY_SAVINGS_ACCOUNTS]: JSON.stringify(nextAccounts),
    }
    setSavingsAccounts(nextAccounts)
    await persistSettings(nextSettings)
    await onReloadView()
  }

  const onDeleteSavingsAccount = async (iban: string) => {
    const normalized = normalizeIban(iban)
    const nextAccounts = savingsAccounts.filter(a => a !== normalized)
    const nextSettings = {
      ...settings,
      [SETTINGS_KEY_SAVINGS_ACCOUNTS]: JSON.stringify(nextAccounts),
    }
    setSavingsAccounts(nextAccounts)
    await persistSettings(nextSettings)
    await onReloadView()
  }

  useEffect(() => {
    if (resetSignal === 0) return
    void onResetAppState()
  }, [resetSignal])

  const onSelectMode = async (mode: Exclude<EntryMode, 'landing'>) => {
    setEntryMode(mode)
    setAuthFieldErrors({ identifier: '', password: '', general: '' })
    setError(null)
    setRunInfo(null)
    if (mode === 'anonymous') {
      loadAnonymousConfig()
      return
    }
    if (isLoggedIn) {
      try {
        await loadUserConfig()
      } catch (e: any) {
        setError(e?.message ?? t('Incarcarea datelor contului a esuat.', 'Failed to load account data.'))
      }
    }
  }

  if (entryMode === 'landing') {
    return (
      <div id="page-landing" style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 16, width: '100%', maxWidth: 1200, margin: '0 auto', minHeight: '98dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflowX: 'clip' }}>
        <header style={{ width: '100%', background: '#000', padding: '10px 14px' }}>
          <h1
            style={{
              margin: 0,
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 0,
              color: '#fff',
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 'clamp(34px, 4.8vw, 46px)', fontWeight: 800, lineHeight: 1, color: '#111827', background: '#fff', borderRadius: 8, padding: '0 6px' }}>$</span>
            <span style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: 0.2, lineHeight: 1, color: '#fff', WebkitTextStroke: '1.6px #000', textShadow: '0 1px 0 #000', marginLeft: 2 }}>pend</span>
            <span style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: 0.2, lineHeight: 1, color: '#111827', background: '#fff', borderRadius: 8, padding: '0 6px', marginLeft: 6 }}>IQ</span>
          </h1>
        </header>
        <section
          id="section-app-description-landing"
          style={{
            width: '100%',
            marginTop: 8,
            marginBottom: 20,
          }}
        >
          <p style={{ margin: 0, color: '#334155' }}>
            {t(
              'Transformă automat orice extras de cont într-un dashboard financiar interactiv ce ofera control complet pentru organizarea, filtrarea și interpretarea tranzacțiilor, o balanta clara Venituri vs. Cheltuieli, plus posibilitatea de a include si configura detalii legate de economii.',
              'Automatically turn any account statement into an interactive financial dashboard with full control for organizing, filtering, and interpreting transactions, a clear Income vs. Expenses balance, plus configurable savings details.'
            )}
          </p>
        </section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 0, marginBottom: 10}}>
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 12,
              color: '#475569',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 999,
              padding: '6px 10px',
              width: 'fit-content',
            }}
          >
            <button
              id="btn-breadcrumb-mode-selection-landing"
              className="app-btn"
              onClick={() => {}}
              style={{ border: 'none', background: 'transparent', color: '#0f172a', fontWeight: 600, padding: 0 }}
            >
              {t('Selectare Mod', 'Mode Selection')}
            </button>
          </nav>
          <select
            id="select-language-landing"
            value={language}
            onChange={e => { void onLanguageChange(e.target.value) }}
            style={{ padding: '6px 8px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', color: '#1f2937', fontSize: 12 }}
          >
            <option value="ro">Romana</option>
            <option value="en">English</option>
          </select>
        </div>
        {isLanguageSwitching ? (
          <section
            id="section-language-loading-landing"
            style={{
              marginTop: 16,
              minHeight: 320,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <span className="reload-spin" style={{ fontSize: 28, lineHeight: 1 }}>{'\u21bb'}</span>
            <span style={{ fontSize: 13, color: '#475569' }}>{t('Se aplica limba selectata...', 'Applying selected language...')}</span>
          </section>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 14 }}>
                <div id="card-landing-anonymous" style={{ border: '1px solid #d9e2ec', borderRadius: 12, padding: 12, background: '#ffffff' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t('Anonim', 'Anonymous')}</h3>
                  <p style={{ marginTop: 0, color: '#475569', fontSize: 13 }}>
                    {t(
                      'Functioneaza imediat fara cont. Categoriile si override-urile se salveaza local, doar in acest browser/dispozitiv.',
                      'Works immediately with no account. Categories and overrides are saved only in this browser/device using local storage.'
                    )}
                  </p>
                  <button
                    id="btn-landing-anonymous"
                    className="app-btn"
                    onClick={() => onSelectMode('anonymous')}
                    style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: '#fff', fontWeight: 600 }}
                  >
                    {t('Continua ca Anonim', 'Continue as Anonymous')}
                  </button>
                </div>
                <div id="card-landing-account" style={{ border: '1px solid #d9e2ec', borderRadius: 12, padding: 12, background: '#ffffff' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t('Cont Utilizator', 'User Account')}</h3>
                  <p style={{ marginTop: 0, color: '#475569', fontSize: 13 }}>
                    {t(
                      'Autentifica-te pentru a salva categoriile si override-urile per cont in baza de date, sincronizate intre sesiuni.',
                      'Sign in to store categories and merchant/type overrides per account in the database, synced across sessions.'
                    )}
                  </p>
                  <button
                    id="btn-landing-account"
                    className="app-btn"
                    onClick={() => onSelectMode('account')}
                    style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', fontWeight: 600 }}
                  >
                    {t('Continua cu Cont Utilizator', 'Continue with User Account')}
                  </button>
                </div>
              </div>
          </>
        )}
        <footer style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid #e2e8f0', color: '#666', fontSize: 12 }}>
          {t(
            'V1.1 - Modul anonim foloseste cache local. Modul autentificat stocheaza categoriile si override-urile per cont.',
            'V1.1 - Anonymous mode uses local cache. Signed-in mode stores categories and overrides per account.'
          )}
        </footer>
      </div>
    )
  }

  return (
    <div id="page-main" style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 16, width: '100%', maxWidth: 1200, margin: '0 auto', minHeight: '98dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflowX: 'clip' }}>
      <header style={{ width: '100%', background: '#000', padding: '10px 14px', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1
            style={{
              margin: 0,
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 0,
              color: '#fff',
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 'clamp(34px, 4.8vw, 46px)', fontWeight: 800, lineHeight: 1, color: '#111827', background: '#fff', borderRadius: 8, padding: '0 6px' }}>$</span>
            <span style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: 0.2, lineHeight: 1, color: '#fff', WebkitTextStroke: '1.6px #000', textShadow: '0 1px 0 #000', marginLeft: 2 }}>pend</span>
            <span style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: 0.2, lineHeight: 1, color: '#111827', background: '#fff', borderRadius: 8, padding: '0 6px', marginLeft: 6 }}>IQ</span>
          </h1>
        </div>
      </header>
      <section
        id="section-app-description-main"
        style={{
          width: '100%',
          marginTop: 8,
          marginBottom: 20,
        }}
      >
        <p style={{ margin: 0, color: '#334155' }}>
          {t(
            'Transformă automat orice extras de cont într-un dashboard financiar interactiv ce ofera control complet pentru organizarea, filtrarea și interpretarea tranzacțiilor, o balanta clara Venituri vs. Cheltuieli, plus posibilitatea de a include si configura detalii legate de economii.',
            'Automatically turn any account statement into an interactive financial dashboard with full control for organizing, filtering, and interpreting transactions, a clear Income vs. Expenses balance, plus configurable savings details.'
          )}
        </p>
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 0, marginBottom: 10 }}>
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: 12,
            color: '#475569',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 999,
            padding: '6px 10px',
            width: 'fit-content',
          }}
        >
          <button
            id="btn-breadcrumb-mode-selection"
            className="app-btn"
            onClick={() => { setEntryMode('landing') }}
            style={{ border: 'none', background: 'transparent', color: '#0f172a', fontWeight: 600, padding: 0 }}
          >
            {t('Selectare Mod', 'Mode Selection')}
          </button>
          {entryMode === 'anonymous' && (
            <>
              <span style={{ color: '#94a3b8' }}>{'>'}</span>
              <span>{t('Anonim', 'Anonymous')}</span>
              <span style={{ color: '#94a3b8' }}>{'>'}</span>
              <span>{t('Dashboard', 'Dashboard')}</span>
            </>
          )}
          {entryMode === 'account' && !isLoggedIn && (
            <>
              <span style={{ color: '#94a3b8' }}>{'>'}</span>
              <span>{t('Autentificare utilizator', 'User Login')}</span>
            </>
          )}
          {entryMode === 'account' && isLoggedIn && (
            <>
              <span style={{ color: '#94a3b8' }}>{'>'}</span>
              <span>{t(`Cont Utilizator (${userEmail})`, `User Account (${userEmail})`)}</span>
              <span style={{ color: '#94a3b8' }}>{'>'}</span>
              <span>{t('Dashboard', 'Dashboard')}</span>
            </>
          )}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flex: '1 1 auto', minWidth: 0 }}>
          {entryMode !== 'anonymous' && authLoading ? (
            <div style={{ fontSize: 12, color: '#475569' }}>{t('Verific sesiunea...', 'Checking session...')}</div>
          ) : isLoggedIn ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#1e293b' }}>{t('Conectat: ', 'Signed in: ')}{userEmail}</span>
              <button
                id="btn-auth-logout"
                className="app-btn"
                onClick={onLogout}
                disabled={authBusy || loading}
                style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', color: '#1f2937', fontWeight: 600 }}
              >
                {t('Deconectare', 'Logout')}
              </button>
              <div style={{ width: 1, height: 20, background: '#dbe4ef' }} />
              <select
                id="select-language"
                value={language}
                onChange={e => { void onLanguageChange(e.target.value) }}
                style={{ padding: '6px 8px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', color: '#1f2937', fontSize: 12 }}
              >
                <option value="ro">Romana</option>
                <option value="en">English</option>
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <select
                id="select-language"
                value={language}
                onChange={e => { void onLanguageChange(e.target.value) }}
                style={{ padding: '6px 8px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', color: '#1f2937', fontSize: 12 }}
              >
                <option value="ro">Romana</option>
                <option value="en">English</option>
              </select>
            </div>
          )}
        </div>
      </div>
      {isAccountMode && !isLoggedIn && !authLoading && (
        <section
          id="section-auth-form"
          style={{
            marginTop: 20,
            maxWidth: 460,
            marginLeft: 'auto',
            marginRight: 'auto',
            padding: 0,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 10, textAlign: 'center' }}>{t('Login / Inregistrare', 'Login / Register')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={authIdentifier}
              onChange={e => {
                setAuthIdentifier(e.target.value)
                setAuthFieldErrors(prev => ({ ...prev, identifier: '', general: '' }))
              }}
              placeholder={t('Email / Utilizator', 'Email / Username')}
              type="text"
              style={{ height: 40, padding: '0 10px', borderRadius: 10, border: `1px solid ${authFieldErrors.identifier ? '#dc2626' : '#bbb'}`, width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ position: 'relative' }}>
              <input
                value={authPassword}
                onChange={e => {
                  setAuthPassword(e.target.value)
                  setAuthFieldErrors(prev => ({ ...prev, password: '', general: '' }))
                }}
                placeholder={t('Parola', 'Password')}
                type={showAuthPassword ? 'text' : 'password'}
                style={{ height: 40, padding: '0 34px 0 10px', borderRadius: 10, border: `1px solid ${authFieldErrors.password ? '#dc2626' : '#bbb'}`, width: '100%', boxSizing: 'border-box' }}
              />
              <button
                id="btn-toggle-auth-password"
                type="button"
                className="app-btn"
                onClick={() => setShowAuthPassword(v => !v)}
                title={showAuthPassword ? t('Ascunde parola', 'Hide password') : t('Arata parola', 'Show password')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 24,
                  height: 24,
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showAuthPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.7 10.7A2 2 0 0 0 12 14a2 2 0 0 0 1.3-.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c5.1 0 9.3 3.1 10.8 7-0.4 1-1 1.9-1.7 2.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M6.2 6.2C4.4 7.4 3 9 2.2 12 3.7 15.9 7.9 19 12 19c1.5 0 2.9-0.4 4.2-1.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.2 12C3.7 8.1 7.9 5 12 5s8.3 3.1 9.8 7c-1.5 3.9-5.7 7-9.8 7s-8.3-3.1-9.8-7z" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
            <div style={{ minHeight: 18, fontSize: 12, color: '#dc2626', textAlign: 'center' }}>
              {authFieldErrors.identifier || authFieldErrors.password || authFieldErrors.general}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6 }}>
              <button
                id="btn-auth-login"
                className="app-btn"
                onClick={() => handleAuthAction('login')}
                disabled={authBusy || loading}
                style={{ width: 120, height: 38, padding: 0, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: '#fff', fontWeight: 600 }}
              >
                {t('Autentificare', 'Login')}
              </button>
              <button
                id="btn-auth-register"
                className="app-btn"
                onClick={() => handleAuthAction('register')}
                disabled={authBusy || loading}
                style={{ width: 120, height: 38, padding: 0, borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', color: '#1f2937', fontWeight: 600 }}
              >
                {t('Inregistrare', 'Register')}
              </button>
            </div>
          </div>
        </section>
      )}

      {canUseDashboard && (
        <>
          {isLanguageSwitching ? (
            <section
              id="section-language-loading"
              style={{
                marginTop: 16,
                minHeight: 420,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <span className="reload-spin" style={{ fontSize: 28, lineHeight: 1 }}>{'\u21bb'}</span>
              <span style={{ fontSize: 13, color: '#475569' }}>{t('Se aplica limba selectata...', 'Applying selected language...')}</span>
            </section>
          ) : (
            <>
          <section id="card-upload-build" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={onFileSelected}
                style={{ display: 'none' }}
              />
              <button
                id="btn-choose-file-build-dashboard"
                className="app-btn"
                onClick={onChooseAndBuild}
                disabled={isBuildingDashboard || isLanguageSwitching || (isAccountMode && !isLoggedIn)}
                style={{
                  height: 36,
                  width: 196,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: (isBuildingDashboard || isLanguageSwitching || (isAccountMode && !isLoggedIn)) ? '#d6dce5' : 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                  color: (isBuildingDashboard || isLanguageSwitching || (isAccountMode && !isLoggedIn)) ? '#49566a' : '#fff',
                  fontWeight: 600,
                  boxShadow: (isBuildingDashboard || isLanguageSwitching || (isAccountMode && !isLoggedIn)) ? 'none' : '0 6px 16px rgba(37,99,235,0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isBuildingDashboard ? (
                  <>
                    <span className="reload-spin" style={{ fontSize: 14, lineHeight: 1 }}>{'\u21bb'}</span>
                    <span>{t('Creare dashboard...', 'Building dashboard...')}</span>
                  </>
                ) : (
                  isAccountMode && !isLoggedIn
                    ? t('Login necesar pentru modul de cont', 'Login Required for Account Mode')
                    : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" fill="none" stroke="currentColor" strokeWidth="2" />
                          <path d="M14 3v6h6" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <span>{t('Importa extras bancar', 'Import Bank Statement')}</span>
                      </>
                    )
                )}
              </button>
              <button
                id="btn-reload-view"
                className="app-btn"
                onClick={() => { void onResetDashboardView() }}
                disabled={!canUseDashboard || txs.length === 0 || !canReloadView || loading || isReloadingView}
                title={t('Reincarca vizualizarea', 'Reload View')}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid #d1dbe8',
                  background: '#ffffff',
                  color: '#1f2937',
                  fontWeight: 700,
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className={isReloadingView ? 'reload-spin' : ''}>{'\u21bb'}</span>
              </button>
              <div
                style={{
                  minHeight: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  flex: '1 1 280px',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <div
                  id="notice-upload-result"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 10,
                    border: isErrorNotice ? '1px solid #fca5a5' : '1px solid #86efac',
                    background: isErrorNotice ? '#fef2f2' : '#f0fdf4',
                    color: isErrorNotice ? '#b91c1c' : '#166534',
                    fontSize: 12,
                    lineHeight: 1.2,
                    width: 'fit-content',
                    maxWidth: '100%',
                    visibility: noticeText ? 'visible' : 'hidden',
                  }}
                >
                  <span style={{ minWidth: 0, flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {renderNoticeText()}
                  </span>
                  <button
                    id="btn-close-upload-result"
                    className="app-btn"
                    onClick={() => { setRunInfo(null); setError(null) }}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      border: isErrorNotice ? '1px solid #fecaca' : '1px solid #bbf7d0',
                      background: '#ffffff',
                      color: isErrorNotice ? '#b91c1c' : '#166534',
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      pointerEvents: noticeText ? 'auto' : 'none',
                    }}
                    title={t('Inchide notificarea', 'Close notification')}
                  >
                    x
                  </button>
                </div>
              </div>
            </div>
          </section>

        <Dashboard
          txs={txs}
          statementDetails={statementDetails}
          categories={categories}
          language={language}
          savingsAccounts={savingsAccounts}
          onAddSavingsAccount={onAddSavingsAccount}
          onDeleteSavingsAccount={onDeleteSavingsAccount}
          onOverrideMerchant={onOverrideMerchant}
          onOverrideTransaction={onOverrideTransaction}
          canResetCategories={canResetCategories}
          newCategory={newCategory}
          onNewCategoryChange={setNewCategory}
          onAddCategory={handleAddCategory}
          selectedCategory={selectedCategory}
          onSelectedCategoryChange={setSelectedCategory}
          editingCategory={editingCategory}
          editingValue={editingValue}
          onEditingValueChange={setEditingValue}
          onStartRenameCategory={startRenameCategory}
          onApplyRenameCategory={applyRenameCategory}
          onCancelRenameCategory={cancelRenameCategory}
          onDeleteCategory={handleDeleteCategory}
        />
            </>
          )}
        </>
      )}

      <footer style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid #e2e8f0', color: '#666', fontSize: 12 }}>
        {t(
          'V1.1 - Modul anonim foloseste cache local. Modul autentificat stocheaza categoriile si override-urile per cont.',
          'V1.1 - Anonymous mode uses local cache. Signed-in mode stores categories and overrides per account.'
        )}
      </footer>
    </div>
  )
}
