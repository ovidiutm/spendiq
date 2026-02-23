import React from 'react'
import type { Language } from './i18n'
import type { CookieConsent } from './consent'

type Props = {
  language: Language
  t: (key: string) => string
  visible: boolean
  modalOpen: boolean
  draft: Pick<CookieConsent, 'preferences' | 'performance'>
  onDraftChange: (next: Pick<CookieConsent, 'preferences' | 'performance'>) => void
  onAcceptAll: () => void
  onRejectOptional: () => void
  onOpenCustomize: () => void
  onOpenSettings: () => void
  onCloseModal: () => void
  onSaveSelection: () => void
}

export default function CookieConsentPanel({
  t,
  visible,
  modalOpen,
  draft,
  onDraftChange,
  onAcceptAll,
  onRejectOptional,
  onOpenCustomize,
  onOpenSettings,
  onCloseModal,
  onSaveSelection,
}: Props) {
  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 1200,
    margin: '0 auto',
    maxWidth: 1200,
    background: '#ffffff',
    border: '1px solid #dbe4ef',
    borderRadius: 14,
    boxShadow: '0 14px 34px rgba(15, 23, 42, 0.16)',
    padding: 12,
    display: 'grid',
    gap: 10,
  }

  return (
    <>
      {visible && (
        <section id="cookie-consent-banner" style={cardStyle} role="dialog" aria-live="polite" aria-label={t('k_cookie_banner_title')}>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{t('k_cookie_banner_title')}</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.35 }}>{t('k_cookie_banner_description')}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button id="btn-cookie-reject-optional" className="app-btn" onClick={onRejectOptional} style={{ height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', fontWeight: 600 }}>
              {t('k_cookie_reject_optional')}
            </button>
            <button id="btn-cookie-customize" className="app-btn" onClick={onOpenCustomize} style={{ height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', fontWeight: 600 }}>
              {t('k_cookie_customize')}
            </button>
            <button id="btn-cookie-accept-all" className="app-btn" onClick={onAcceptAll} style={{ height: 34, padding: '0 12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', fontWeight: 700 }}>
              {t('k_cookie_accept_all')}
            </button>
          </div>
        </section>
      )}

      {!visible && (
        <button
          id="btn-cookie-settings"
          className="app-btn"
          onClick={onOpenSettings}
          title={t('k_cookie_settings')}
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 1100,
            height: 34,
            padding: '0 10px',
            borderRadius: 999,
            border: '1px solid #d1dbe8',
            background: '#ffffff',
            color: '#0f172a',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.12)',
          }}
        >
          {t('k_cookie_settings')}
        </button>
      )}

      {modalOpen && (
        <div
          id="cookie-consent-modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) onCloseModal()
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.35)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div id="cookie-consent-modal" style={{ width: '100%', maxWidth: 620, background: '#fff', borderRadius: 14, border: '1px solid #dbe4ef', boxShadow: '0 16px 40px rgba(15, 23, 42, 0.2)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{t('k_cookie_modal_title')}</h3>
              <button id="btn-cookie-modal-close" className="app-btn" onClick={onCloseModal} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #d1dbe8', background: '#fff', fontWeight: 700 }}>x</button>
            </div>
            <p style={{ marginTop: 0, marginBottom: 12, color: '#475569', fontSize: 13, lineHeight: 1.35 }}>{t('k_cookie_modal_description')}</p>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t('k_cookie_necessary')}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{t('k_cookie_necessary_description')}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>{t('k_cookie_always_active')}</span>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t('k_cookie_preferences')}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{t('k_cookie_preferences_description')}</div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      id="toggle-cookie-preferences"
                      type="checkbox"
                      checked={draft.preferences}
                      onChange={e => onDraftChange({ ...draft, preferences: e.target.checked })}
                    />
                  </label>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t('k_cookie_performance')}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{t('k_cookie_performance_description')}</div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      id="toggle-cookie-performance"
                      type="checkbox"
                      checked={draft.performance}
                      onChange={e => onDraftChange({ ...draft, performance: e.target.checked })}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button id="btn-cookie-modal-cancel" className="app-btn" onClick={onCloseModal} style={{ height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid #d1dbe8', background: '#fff', fontWeight: 600 }}>
                {t('k_cancel')}
              </button>
              <button id="btn-cookie-modal-save" className="app-btn" onClick={onSaveSelection} style={{ height: 34, padding: '0 12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: '#fff', fontWeight: 700 }}>
                {t('k_cookie_save_selection')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
