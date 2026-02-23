export type CookieConsent = {
  necessary: true
  preferences: boolean
  performance: boolean
  updatedAt: string
  version: number
}

const CONSENT_STORAGE_KEY = 'spendiq.cookie-consent.v1'
const CONSENT_COOKIE_KEY = 'spendiq_cookie_consent'
const CONSENT_VERSION = 1

function defaultConsent(): CookieConsent {
  return {
    necessary: true,
    preferences: false,
    performance: false,
    updatedAt: new Date(0).toISOString(),
    version: CONSENT_VERSION,
  }
}

function normalizeConsent(raw: any): CookieConsent | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    necessary: true,
    preferences: !!raw.preferences,
    performance: !!raw.performance,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    version: typeof raw.version === 'number' ? raw.version : CONSENT_VERSION,
  }
}

export function hasStoredCookieConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    return !!raw
  } catch {
    return false
  }
}

export function loadCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    return normalizeConsent(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeConsentCookie(consent: CookieConsent) {
  try {
    const encoded = encodeURIComponent(JSON.stringify({
      v: consent.version,
      p: consent.preferences ? 1 : 0,
      perf: consent.performance ? 1 : 0,
      t: consent.updatedAt,
    }))
    const maxAge = 60 * 60 * 24 * 365
    document.cookie = `${CONSENT_COOKIE_KEY}=${encoded}; path=/; max-age=${maxAge}; samesite=lax`
  } catch {
    // ignore cookie write errors
  }
}

export function saveCookieConsent(next: Pick<CookieConsent, 'preferences' | 'performance'>): CookieConsent {
  const normalized: CookieConsent = {
    necessary: true,
    preferences: !!next.preferences,
    performance: !!next.performance,
    updatedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  }
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // ignore local storage write errors
  }
  writeConsentCookie(normalized)
  return normalized
}

export function getEffectiveCookieConsent(): CookieConsent {
  return loadCookieConsent() ?? defaultConsent()
}

export function canUsePreferencesStorage(): boolean {
  return getEffectiveCookieConsent().preferences
}

export function canUsePerformanceStorage(): boolean {
  return getEffectiveCookieConsent().performance
}

export function clearOptionalBrowserStorageByConsent(consent: CookieConsent) {
  try {
    if (!consent.preferences) {
      localStorage.removeItem('expenses-helper.merchantOverrides.v1')
      localStorage.removeItem('expenses-helper.categories.v1')
      localStorage.removeItem('expenses-helper.settings.v1')
      localStorage.removeItem('expenses-helper.dashboard-view-state.v1')
    }
    if (!consent.performance) {
      const keysToRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i)
        if (!key) continue
        if (key.startsWith('expenses-helper.dashboard-cache.v2') || key.startsWith('expenses-helper.statement-details-cache.v2') || key === 'expenses-helper.dashboard-cache.v1' || key === 'expenses-helper.statement-details-cache.v1') {
          keysToRemove.push(key)
        }
      }
      for (const key of keysToRemove) sessionStorage.removeItem(key)
    }
  } catch {
    // ignore storage cleanup errors
  }
}
