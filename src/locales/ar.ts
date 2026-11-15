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

  'top.view': 'العرض',
  'top.guide': 'الدليل',
  'top.places': 'الأماكن',
  'top.shareTip': 'مشاركة هذا العرض',
  'top.menu': 'القائمة',
  'rail.zoomIn': 'تكبير (+)',
  'rail.zoomInLabel': 'تكبير السماء',
  'rail.zoomOut': 'تصغير (−)',
  'rail.zoomOutLabel': 'تصغير السماء',
  'rail.skyMap': 'خريطة السماء',
  'rail.grid': 'شبكة الإحداثيات',
  'rail.frames': 'إضافة إطار · مساحات العمل',
  'rail.framesLabel': 'إضافة إطار، مساحات العمل',

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

  // The bar (viewer/bar.ts).
  "bar.lamRed": "بعد الأحمر مباشرة",
  "bar.lamNear": "تحت الحمراء القريبة",
  "bar.lamDeeper": "تحت الحمراء الأعمق",
  "bar.lamLonger": "تحت الحمراء الأطول",
  "bar.lamHeat": "توهّج حراري",
  "bar.playback": "التشغيل",
  "bar.prevLabel": "الصورة السابقة",
  "bar.prev": "السابقة (←)",
  "bar.nextLabel": "الصورة التالية",
  "bar.next": "التالية (→)",
  "bar.playTip": "تشغيل (Space)",
  "bar.pauseTip": "إيقاف مؤقت (Space)",
  "bar.dates": "التواريخ",
  "bar.countTip": "الصورة المعروضة من بين كل الزيارات",
  "bar.loopStyle": "نمط التكرار",
  "bar.loopForward": "تكرار: إلى الأمام",
  "bar.loopBounce": "تكرار: إلى الأمام ثم إلى الخلف",
  "bar.speed": "السرعة",
  "bar.wavelength": "الطول الموجي",
  "bar.wavelengthTip": "لون الأشعة تحت الحمراء التي التُقطت بها الصور. ويحدد خريطة السماء أيضًا",
  "bar.same": "الطول الموجي نفسه فقط",
  "bar.sameTip": "شغّل فقط اللقطات المأخوذة بالطول الموجي المحدد على المقياس",
  "bar.sameMissing": "لا لقطة بهذا الطول الموجي في {passes}: تُركت",
  "bar.allSix": "الستة كلها",
  "bar.color": "ألوان",
  "bar.handleText": "{lam}، الكاشف {det}",
  "bar.waitLoad": "بانتظار تحميل الصور…",
  "bar.waitArchive": "بانتظار الصور من أرشيف ناسا…",
  "bar.noPictures": "لا صور هنا للتشغيل",
  "bar.noDetPictures": "لا صور {det} للتشغيل",
  "bar.oneDate": "تاريخ واحد فقط هنا: لا شيء للتشغيل",

  // The date strip under the picture (viewer/chips.ts).
  "fp.date": "التاريخ",
  "fp.allSix": "الكواشف الستة كلها",
  "fp.noneYet": "لا صور بعد",
  "fp.noDate": "بلا تاريخ",
  "fp.missing": ": لا صورة {det}",

  // The frame (viewer/frame.ts). View names follow the glossary.
  "view.flip": "تقليب",
  "view.flip.tip": "اعرض التواريخ واحدًا بعد الآخر",
  "view.swipe": "سحب",
  "view.swipe.tip": "اسحب الخط لتقارن التاريخ المرجعي بهذا التاريخ",
  "view.two": "تاريخان",
  "view.two.tip": "تاريخان في صورة واحدة: الأحمر أقدم، والسماوي أحدث",
  "view.diff": "فرق",
  "view.diff.tip": "فقط ما هو أسطع أو أخفت من المعتاد",
  "view.stack": "تكديس",
  "view.stack.tip": "كل التواريخ مجموعة، لترى ما هو أخفت من أن يظهر في واحد",
  "view.trail": "أثر",
  "view.trail.tip": "تبقى التواريخ الأقدم أثرًا يخفت",
  "explain.flip": "كل صورة زيارة واحدة، مضبوطة على السطوع المرجعي. النجوم تبقى في مكانها، وما ينزاح يتحرك.",
  "explain.swipe": "يسار الخط التاريخ المرجعي، ويمينه هذا التاريخ. اسحب الخط فوق أي شيء يختلف.",
  "explain.two": "الأحمر التاريخ المرجعي، والسماوي هذا التاريخ. ما لم يتغير أبيض، وزوج أحمر وسماوي يعني حركة.",
  "explain.diff": "هذا التاريخ مطروحًا منه وسيط كل التواريخ: الأبيض موجود الآن، والداكن حيث يكون عادة.",
  "explain.stack": "كل لقطات هذا الكاشف مجموعة، فتتراكم الأجسام الخافتة ويقل الضجيج.",
  "explain.trail": "هذا التاريخ بالألوان، والتواريخ الأقدم أثر يخفت: الجسم المتحرك يرسم مساره.",
  "src.real": "بيانات حقيقية",
  'src.realHow': 'بيانات حقيقية، {how}',
  "src.realTip": "لقطات حقيقية من تلسكوب SPHEREx التابع لناسا، من أرشيف ناسا (IRSA)",
  "src.live": "بيانات حقيقية، جُلبت حيًّا",
  "src.liveTip": "لقطات حقيقية جُلبت الآن من أرشيف ناسا (IRSA) لهذه البقعة",
  "src.simTip": "صور مختلَقة للتمرين، لا تُخلط أبدًا بالنتائج الحقيقية",
  "src.none": "لا صور هنا",
  "src.noneTip": "لا صور حقيقية لهذه البقعة في الإطار",
  "src.loading": "جارٍ التحميل…",
  "src.loadingTip": "لقطات حقيقية لهذه البقعة في الطريق",
  "frame.fov": "حجم المجال",
  "frame.fovLabel": "حجم المجال: {n} دقيقة قوسية",
  "frame.fovTip": "حجم المجال (تغيّره العجلة فوق الصورة أيضًا)",
  "frame.about": "عن هذه الصورة",
  "frame.tools": "أدوات الصورة",
  "frame.closeMeasure": "إغلاق القياس",
  "frame.simple": "العودة إلى العرض البسيط",
  "frame.measureTip": "قياس: الأرقام والرسوم والعروض الستة",
  "frame.hide": "إخفاء الإطار",
  "frame.release": "إصدار البيانات: {r}",
  "frame.still": "جهازك يطلب حركة أقل، فهذه صورة ثابتة لتاريخين. اضغط «تقليب» لتشغيلهما.",
  "frame.wider": "لقطات حقيقية للمجال الأوسع",
  "frame.askAgain": "اطلب مجددًا",
  "frame.preview": "معاينة: خريطة السماء، متوسط كل التواريخ",
  "frame.coverMore": "قد يستغرق بضع دقائق. السماء تعمل في أثناء ذلك.",
  "frame.noPractice": "محاكاة التمرين بلا صور في هذا الإصدار.",
  "frame.noSpot": "لا صور لهذه البقعة في الإطار.",
  "frame.noneYet": "لا صور حقيقية بعد",
  "frame.noneHere": "لا صور حقيقية هنا",
  "frame.openNow": "صور SPHEREx حقيقية يمكنك فتحها الآن",
  "frame.practice": "تمرّن على صور مختلَقة",

};
