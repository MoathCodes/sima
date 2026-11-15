/**
 * Arabic words of the interface (Modern Standard Arabic). Owner: the Arabic locale lane.
 *
 * Typed against en.ts: a missing key, or a plain string where English has a plural, is a type
 * error. Terms follow docs/arabic-glossary.md. Digits stay Western (0–9); source names (NASA,
 * IRSA, SPHEREx, Gaia) stay in Latin script. "محاكاة" (Simulated) always comes first.
 */
import type { en } from './en.ts';

/** An Arabic plural: every form Intl.PluralRules('ar') can pick. */
export interface ArPlural {
  readonly zero: string;
  readonly one: string;
  readonly two: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

/** Every English key, with an Arabic string or an Arabic plural in its place. */
export type ArMessages = {
  readonly [K in keyof typeof en]: (typeof en)[K] extends string ? string : ArPlural;
};

export const ar: ArMessages = {
  'app.title': 'سيما: راقب تغيّر السماء بالأشعة تحت الحمراء',
  'app.description':
    'سماء SPHEREx من ناسا بالأشعة تحت الحمراء: ضع إطارًا على أي بقعة وشغّل لقطاتها الحقيقية بترتيب التاريخ. النجوم تبقى ثابتة، وكل ما يتحرك أو يتغيّر يظهر.',

  'lang.group': 'اللغة',

  'toast.close': 'إغلاق الرسالة',
  'link.notUnderstood': 'لم يُفهم من الرابط، فتُرك: {notes}.',
  'copy.done': 'نُسخ {text}',
  'copy.failed': 'تعذّر النسخ. الإحداثيات هي {text}',
  'ws.unreadLink': 'تعذّرت قراءة رابط مساحة العمل.',
  'ws.usualView': '{note} فُتح العرض المعتاد بدلًا منه.',
  'ws.saved': 'حُفظ «{name}» في هذا المتصفح.',
  'ws.notSaved': 'هذا المتصفح لا يسمح بالحفظ هنا، فلم يُحفظ. صدّره ملفًا بدلًا من ذلك.',
  'ws.unread': 'تعذّرت قراءة «{name}».',
  'ws.notJson': '«{name}» ليس ملف مساحة عمل (ليس JSON).',
  'ws.opened': 'فُتح «{name}».',
  'ws.deleted': 'حُذف «{name}».',
  'ws.dropOnSky': 'أفلته على السماء، لا على بطاقة.',

  'about.title': 'عن سيما',
  'about.close': 'إغلاق «عن سيما»',
  'about.toc': 'أقسام «عن سيما»',
  'about.sec.use': 'طريقة الاستخدام',
  'about.sec.method': 'المنهج',
  'about.sec.targets': 'الأهداف',
  'about.sec.planetX': 'الكوكب X',
  'about.sec.challenge': 'التحدي',
  'about.sec.limits': 'الحدود',
  'about.sec.ai': 'الذكاء الاصطناعي',
  'about.sec.sources': 'المصادر',

  'word.close': 'إغلاق',
  'word.back': 'رجوع',
  'word.settings': 'الإعدادات',
  'word.about': 'عن سيما',
  'word.search': 'بحث',
  'word.share': 'مشاركة',
  'word.play': 'تشغيل',
  'word.pause': 'إيقاف مؤقت',
  'word.discover': 'استكشاف',
  'word.expert': 'خبير',
  'word.missions': 'المهام',
  'word.measure': 'قياس',

  'honest.simulated': 'محاكاة',
  'honest.pretend': 'افتراضي',
  'honest.notMeasured': 'لم يُقَس',
  'honest.notMeasuredWhy': 'لم يُقَس: {reason}',
  'honest.candidate': 'مرشّح للتحقق، لا اكتشاف',

  'mission.runaway': 'الهارب',
  'mission.ghost': 'الشبح',
  'mission.planetX': 'محاكاة: الكوكب X',
  'target.barnard.line': 'النجم الهارب',
  'target.eps-indi-b.line': 'النجمان الفاشلان التوأمان',
  'target.wise-0855.line': 'أبرد نجم فاشل',
  'target.rw-aur.line': 'الوليد المتذبذب',
  'target.r-dra.line': 'العملاق النابض',

  'count.exposures': {
    zero: 'لا لقطات',
    one: 'لقطة واحدة',
    two: 'لقطتان',
    few: '{n} لقطات',
    many: '{n} لقطة',
    other: '{n} لقطة',
  },
  'count.frames': {
    zero: 'لا إطارات',
    one: 'إطار واحد',
    two: 'إطاران',
    few: '{n} إطارات',
    many: '{n} إطارًا',
    other: '{n} إطار',
  },
  'count.dates': {
    zero: 'لا تواريخ',
    one: 'تاريخ واحد',
    two: 'تاريخان',
    few: '{n} تواريخ',
    many: '{n} تاريخًا',
    other: '{n} تاريخ',
  },
  'count.passes': {
    zero: 'لا مسوح',
    one: 'مسح واحد',
    two: 'مسحان',
    few: '{n} مسوح',
    many: '{n} مسحًا',
    other: '{n} مسح',
  },
};
