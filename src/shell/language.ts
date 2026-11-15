/**
 * The language switch in Settings: English | العربية. Owner: the Arabic locale lane.
 * Each choice is named in its own language. Choosing one stores it, puts `lang=` in the address
 * and reloads (i18n.ts setLocale), so every part starts again in that language and direction.
 */
import { LOCALES, LOCALE_NAMES, locale, setLocale, t } from './i18n.ts';

/** A Settings group (`st-group`) with the switch; settings.ts appends it. */
export function languageGroup(): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'st-group';
  sec.dataset.i18n = '';
  sec.setAttribute('aria-labelledby', 'st-lang');
  sec.innerHTML = `
    <h3 class="group-label" id="st-lang">${t('lang.group')}</h3>
    <div class="seg st-seg" role="radiogroup" aria-labelledby="st-lang" data-guide="language">
      ${LOCALES.map(
        (l) =>
          `<button type="button" role="radio" lang="${l}" data-lang="${l}" aria-checked="${l === locale()}" tabindex="${l === locale() ? 0 : -1}">${LOCALE_NAMES[l]}</button>`,
      ).join('')}
    </div>`;
  const radios = [...sec.querySelectorAll<HTMLElement>('[data-lang]')];
  const pick = (r: HTMLElement | undefined) => {
    const l = r?.dataset.lang;
    if (l === 'en' || l === 'ar') {
      if (l !== locale()) setLocale(l);
    }
  };
  for (const r of radios) r.addEventListener('click', () => pick(r));
  sec.querySelector('.seg')!.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const i = radios.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (i < 0 || step === undefined) return;
    ev.preventDefault();
    radios[(i + step + radios.length) % radios.length]?.focus();
  });
  return sec;
}
