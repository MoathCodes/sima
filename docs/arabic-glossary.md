# Arabic glossary (مسرد المصطلحات)

One Arabic word for each term in Sima, so every screen says the same thing. Modern Standard Arabic,
short labels. `src/locales/ar.ts` follows this list; when a term changes, change it here first.

## House rules

- **Digits stay Western (0–9)**, also in Arabic text: the scientific convention, and common in Gulf
  interfaces. Dates use Arabic month names (أغسطس), Gregorian calendar, via `Intl` (`i18n.ts fmtDate`).
- **Symbols stay as symbols**: µm, ″/yr, ′, pc, AU, mag, %, D1–D6. Write them after the number, as in
  English: `1.71 µm`.
- **Left-to-right runs stay left to right** inside an LTR isolate (`i18n.ts ltr()`): coordinates
  (`17 57 48.5 +04 41 36`), catalogue numbers (M104, NGC 6572, Gaia DR3 …), file names, links.
- **Source names stay in Latin script**: NASA, IRSA, SPHEREx, Gaia, WISE, AllWISE, CatWISE2020, VizieR,
  SIMBAD, OpenNGC, Wikidata, Aladin. Release names too: DR1, QR3.
- **Honesty words**: «محاكاة» (Simulated) always comes first on simulated data; «لم يُقَس» (Not
  measured) always has its reason; never «اكتشاف» (discovery) for anything Sima shows; a find is
  «مرشّح للتحقق».
- **Star names**: use the Arabic name the data already carries (Wikidata / Wikipedia's list of Arabic
  star names, WGSN for the IAU name): نجم السهم، سهيل، الدبران، العيوق، النسر الواقع. Never coin one.
  Where the data has none, keep the catalogue name in Latin script.
- **Fewer words** (REDESIGN.md): a 1–3 word label beats a sentence. No tatweel, no decorative
  diacritics; add a vowel mark only where a word is ambiguous (يُقَس، حُفظ).
- Arabic letters are never letter-spaced (it breaks the joins).

## Astronomy

| English | Arabic | Note |
|---|---|---|
| infrared | الأشعة تحت الحمراء | short: تحت الحمراء |
| near infrared | تحت الحمراء القريبة | |
| wavelength | الطول الموجي | |
| micrometre (µm) | ميكرومتر | write the symbol µm |
| spectrum | طيف | |
| band (of wavelengths) | نطاق | |
| magnitude | القدر | apparent: القدر الظاهري |
| brightness | السطوع | |
| light curve | منحنى الضوء | |
| proper motion | الحركة الذاتية | |
| parallax | اختلاف المنظر | |
| distance | المسافة | |
| light-year | سنة ضوئية | |
| parsec (pc) | فرسخ فلكي | symbol pc |
| astronomical unit (AU) | وحدة فلكية | symbol AU |
| arcminute (′) | دقيقة قوسية | |
| arcsecond (″) | ثانية قوسية | ″/yr: ثانية قوسية في السنة |
| coordinates | الإحداثيات | |
| right ascension (RA) | المطلع المستقيم | |
| declination (Dec) | الميل | |
| north / east | الشمال / الشرق | the compass on pictures keeps the letters N and E |
| star | نجم | |
| brown dwarf | قزم بني | plain words: نجم فاشل |
| failed star | نجم فاشل | |
| red dwarf | قزم أحمر | |
| white dwarf | قزم أبيض | |
| red giant | عملاق أحمر | |
| variable star | نجم متغيّر | |
| young star (newborn) | نجم فتيّ | plain words: نجم وليد |
| galaxy | مجرة | |
| nebula | سديم | planetary nebula: سديم كوكبي |
| star cluster | عنقود نجمي | globular: عنقود كروي، open: عنقود مفتوح |
| planet | كوكب | |
| Planet X | الكوكب X | |
| comet / asteroid | مذنّب / كويكب | |
| telescope | تلسكوب | formal: مقراب |
| sky map | خريطة السماء | |
| whole sky | السماء كلها | |
| noise | الضجيج | signal-to-noise: نسبة الإشارة إلى الضجيج |

## SPHEREx and the data

| English | Arabic | Note |
|---|---|---|
| mission (spacecraft) | بعثة | SPHEREx mission: بعثة SPHEREx |
| exposure | لقطة | technical: تعريض; plural forms in ar.ts `count.exposures` |
| picture | صورة | |
| detector (D1–D6) | كاشف | keep D1–D6 |
| pixel | بكسل | |
| field of view | مجال الرؤية | short: المجال |
| field size | حجم المجال | |
| survey pass | جولة مسح | short: مسح |
| visit | زيارة | |
| date | تاريخ | |
| release (DR1) | إصدار | keep DR1, QR3 |
| catalogue | فهرس | Gaia catalogue: فهرس Gaia |
| catalogue value | قيمة الفهرس | |
| source (catalogue entry) | مصدر | |
| contamination flags | رايات التلوث | |
| saturated (overloaded) | مشبع | |
| typical sky (median) | السماء المعتادة | median: الوسيط |
| real data | بيانات حقيقية | |
| Simulated | محاكاة | always first |
| Pretend (sandbox) | افتراضي | |
| model | نموذج | |
| Not measured | لم يُقَس | with its reason: «لم يُقَس: …» |
| candidate | مرشّح | «مرشّح للتحقق، لا اكتشاف» |
| discovery | اكتشاف | never claimed |
| provenance (where from) | المصدر | |

## Views and tools

| English | Arabic | Note |
|---|---|---|
| Discover (view) | استكشاف | |
| Expert (view) | خبير | |
| Missions | المهام | one: مهمة |
| The runaway (mission) | الهارب | |
| The ghost (mission) | الشبح | |
| Simulated: Planet X (mission) | محاكاة: الكوكب X | |
| skill | مهارة | |
| frame | إطار | |
| patch (spot on the sky) | رقعة | |
| Flip (flip-book, blink) | تقليب | blink comparator: المقارن الوامض |
| Blink | وميض | |
| Swipe | سحب | |
| Two dates | تاريخان | |
| Difference | فرق | |
| Stack | تكديس | |
| Trail | أثر | |
| Measure | قياس | |
| Spectrum (tool) | الطيف | |
| Info | معلومات | |
| Layers | الطبقات | |
| overlay | طبقة | |
| Compare | مقارنة | |
| Link frames | ربط الإطارات | |
| workspace | مساحة العمل | |
| sandbox | ساحة التجربة | |
| Catalogue search | البحث في الفهرس | |
| Same wavelength only | الطول الموجي نفسه فقط | |
| speed / loop | السرعة / التكرار | |

## Interface

| English | Arabic |
|---|---|
| Settings | الإعدادات |
| Language | اللغة |
| About Sima | عن سيما |
| Search | بحث |
| Find a star, galaxy or nebula | ابحث عن نجم أو مجرة أو سديم |
| Places | الأماكن |
| Guide | الدليل |
| Menu | القائمة |
| Share | مشاركة |
| Embed | تضمين |
| Copy link | نسخ الرابط |
| Download | تنزيل |
| Play / Pause | تشغيل / إيقاف مؤقت |
| Next / Previous | التالي / السابق |
| Close | إغلاق |
| Back | رجوع |
| Show me | أرني |
| Start | ابدأ |
| Reset | إعادة ضبط |
| Loading | جارٍ التحميل |
| Zoom in / out | تكبير / تصغير |
| Coordinate grid | شبكة الإحداثيات |
| Panels: Glass / Solid | اللوحات: زجاجية / مصمتة |
| Motion | الحركة |
| Your progress | تقدّمك |

## Layout choices (phase 1)

- The cards keep their English places on the screen; inside each card the order and the text run right
  to left. (The layout code places cards from the sky and the frame; mirroring that is later work.)
- Time runs left to right, as on Arabic scientific plots: playback buttons, the date stops A B C,
  timelines and charts.
- Never mirrored: the sky, pictures, the N/E compass, the scale bar, the wavelength scale (short to long,
  left to right), sliders.
- Mirrored: arrows that point a way (back, the arrow on a primary button).
