import type { OAuthProvider } from './api'

export type FeatureFlag =
  | 'socialAuth'
  | 'socialAuthGoogle'
  | 'socialAuthFacebook'
  | 'socialAuthApple'

const FEATURE_DEFAULTS: Record<FeatureFlag, boolean> = {
  socialAuth: false,
  socialAuthGoogle: false,
  socialAuthFacebook: false,
  socialAuthApple: false,
}

const FEATURE_ENV_NAMES: Record<FeatureFlag, string> = {
  socialAuth: 'VITE_FEATURE_SOCIAL_AUTH',
  socialAuthGoogle: 'VITE_FEATURE_SOCIAL_AUTH_GOOGLE',
  socialAuthFacebook: 'VITE_FEATURE_SOCIAL_AUTH_FACEBOOK',
  socialAuthApple: 'VITE_FEATURE_SOCIAL_AUTH_APPLE',
}

function parseBooleanFlag(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return fallback
  const v = raw.trim().toLowerCase()
  if (['1', 'true', 'on', 'yes', 'y'].includes(v)) return true
  if (['0', 'false', 'off', 'no', 'n'].includes(v)) return false
  return fallback
}

function readFeatureFlag(flag: FeatureFlag): boolean {
  const envName = FEATURE_ENV_NAMES[flag]
  const envValue = (import.meta.env as Record<string, unknown>)[envName]
  return parseBooleanFlag(envValue, FEATURE_DEFAULTS[flag])
}

export const featureFlags: Record<FeatureFlag, boolean> = {
  socialAuth: readFeatureFlag('socialAuth'),
  socialAuthGoogle: readFeatureFlag('socialAuthGoogle'),
  socialAuthFacebook: readFeatureFlag('socialAuthFacebook'),
  socialAuthApple: readFeatureFlag('socialAuthApple'),
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return !!featureFlags[flag]
}

export function isSocialProviderEnabled(provider: OAuthProvider): boolean {
  if (!featureFlags.socialAuth) return false
  if (provider === 'google') return !!featureFlags.socialAuthGoogle
  if (provider === 'facebook') return !!featureFlags.socialAuthFacebook
  return !!featureFlags.socialAuthApple
}

