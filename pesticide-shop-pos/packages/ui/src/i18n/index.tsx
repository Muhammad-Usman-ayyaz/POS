import type { Language } from '@pos/api-contract';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { en, type Messages } from './messages/en.js';
import { ur } from './messages/ur.js';

export { describeError, errorCodes, errorText, type ErrorText } from './errors.js';
export { formatDate, formatMoney, formatQty, ltr } from './format.js';
export type { Messages } from './messages/en.js';

export const MESSAGES: Record<Language, Messages> = { en, ur };
export const LANGUAGES: readonly Language[] = ['en', 'ur'];

export type Direction = 'ltr' | 'rtl';
export const directionOf = (language: Language): Direction => (language === 'ur' ? 'rtl' : 'ltr');

interface I18nValue {
  language: Language;
  dir: Direction;
  /** All the text for the current language. */
  m: Messages;
  setLanguage(language: Language): void;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Gives every component the current language and its texts, and puts `lang` and `dir` on the app root.
 * Switching to Urdu sets dir="rtl" and lang="ur": the layout flips (everything uses start/end, not left/right)
 * and the Urdu font applies. Numbers stay left to right through the .num class.
 */
export function I18nProvider({ language, onLanguageChange, children }: { language: Language; onLanguageChange: (language: Language) => void; children: ReactNode }) {
  const dir = directionOf(language);

  // Also on <html>, so scroll bars, form controls and the browser's own UI follow the language.
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  const value = useMemo<I18nValue>(() => ({ language, dir, m: MESSAGES[language], setLanguage: onLanguageChange }), [language, dir, onLanguageChange]);

  return (
    <I18nContext.Provider value={value}>
      <div id="app-root" lang={language} dir={dir} className="min-h-screen bg-page text-ink">
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
