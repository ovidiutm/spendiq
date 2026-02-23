import { canUsePreferencesStorage } from './consent'
const KEY = 'expenses-helper.merchantOverrides.v1'
const CAT_KEY = 'expenses-helper.categories.v1'
const SETTINGS_KEY = 'expenses-helper.settings.v1'

export function loadOverrides(): Record<string, string> {
  try {
    if (!canUsePreferencesStorage()) return {}
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return (obj && typeof obj === 'object') ? obj : {}
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: Record<string, string>) {
  if (!canUsePreferencesStorage()) return
  localStorage.setItem(KEY, JSON.stringify(overrides))
}

export function loadCategories(defaultCats: string[]): string[] {
  try {
    if (!canUsePreferencesStorage()) return defaultCats
    const raw = localStorage.getItem(CAT_KEY)
    if (!raw) return defaultCats
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return defaultCats
    const cleaned = arr.map(String).map(s => s.trim()).filter(Boolean)
    return Array.from(new Set(cleaned))
  } catch {
    return defaultCats
  }
}

export function saveCategories(categories: string[]) {
  if (!canUsePreferencesStorage()) return
  localStorage.setItem(CAT_KEY, JSON.stringify(categories))
}

export function clearAppCache() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(CAT_KEY)
  localStorage.removeItem(SETTINGS_KEY)
}

export function loadSettings(): Record<string, string> {
  try {
    if (!canUsePreferencesStorage()) return {}
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return (obj && typeof obj === 'object') ? obj : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings: Record<string, string>) {
  if (!canUsePreferencesStorage()) return
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
