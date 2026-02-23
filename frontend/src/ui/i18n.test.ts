import { describe, expect, it } from 'vitest'
import { normalizeLanguage, translateKey, translateKeyFormat } from './i18n'

describe('i18n BVT', () => {
  it('normalizes known and unknown languages', () => {
    expect(normalizeLanguage('ro')).toBe('ro')
    expect(normalizeLanguage('FR')).toBe('fr')
    expect(normalizeLanguage('unknown')).toBe('en')
    expect(normalizeLanguage(undefined)).toBe('en')
  })

  it('returns translated key values for supported languages', () => {
    expect(translateKey('en', 'k_login')).toBe('Login')
    expect(translateKey('ro', 'k_login')).toBe('Autentificare')
    expect(translateKey('fr', 'k_login')).toBe('Connexion')
  })

  it('formats interpolated strings via key catalog', () => {
    const en = translateKeyFormat('en', 'k_done_statement_processed', { file: 'a.pdf', duration: 1.23, count: 10 })
    expect(en).toContain('a.pdf')
    expect(en).toContain('1.23')
    expect(en).toContain('10')
    expect(en.toLowerCase()).toContain('done')
  })
})

