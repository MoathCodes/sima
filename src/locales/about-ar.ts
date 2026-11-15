/**
 * About Sima, in Arabic: the same sections, facts and sources as the English body in
 * src/page/about.ts, written as one document (long prose reads better whole than cut into keys).
 * Owner: the Arabic locale lane. When the English About changes, change this too.
 *
 * Numbers about the five targets are computed from core/targets.ts, as in English (H4, H9).
 * Source names, catalogue numbers and coordinates stay in Latin script, in LTR isolates.
 */
import type { Target } from '../core/types.ts';
import { fmtNum, ltr, t } from '../shell/i18n.ts';

/** Light-years in a parsec (IAU). */
const LY_PER_PC = 3.26156;

type LinkFn = (href: string, text?: string) => string;

const LINES: Record<string, Parameters<typeof t>[0]> = {
  barnard: 'target.barnard.line',
  'eps-indi-b': 'target.eps-indi-b.line',
  'wise-0855': 'target.wise-0855.line',
  'rw-aur': 'target.rw-aur.line',
  'r-dra': 'target.r-dra.line',
};

/** One target's line, from its catalogue motion and (when the parallax is good) distance. */
function target(x: Target): string {
  const motion = Math.hypot(x.pmra, x.pmdec) / 1000; // arcseconds a year
  const digits = motion < 1 ? 3 : 2;
  const facts = [
    `يتحرك ${ltr(`${fmtNum(motion, { minimumFractionDigits: digits, maximumFractionDigits: digits })}″`)} في السنة على السماء`,
  ];
  if (x.plx !== null && x.plx > 20) {
    const ly = (1000 / x.plx) * LY_PER_PC;
    const d = ly < 20 ? 1 : 0;
    facts.push(
      `على بعد نحو ${fmtNum(ly, { minimumFractionDigits: d, maximumFractionDigits: d })} سنة ضوئية`,
    );
  }
  const key = LINES[x.key];
  const line = key ? t(key) : x.line;
  return `<li><b>${ltr(x.name)}</b>: ${line}. من الفهرس: ${facts.join('، ')}
    <span class="about-source">(${ltr(x.values)})</span>.</li>`;
}

/** The Arabic About body. `link` makes an outside link; `targets` are the five test targets. */
export function aboutBodyAr(link: LinkFn, targets: readonly Target[]): string {
  return `
<p class="about-lead">«سيما» كلمة عربية تعني العلامة أو السِّمة. سيما مساحة عمل على سماء تلسكوب SPHEREx التابع لناسا
بالأشعة تحت الحمراء. ضع مربعًا على أي بقعة من السماء، فيعرض الإطار الصور الحقيقية لتلك البقعة بترتيب التاريخ. النجوم
تبقى ثابتة، وكل ما يتحرك أو يتغيّر يظهر.</p>
<p>صنعه فريق SIMA في المدينة المنورة لتحدي ناسا لتطبيقات الفضاء 2026،
«<bdi dir="ltr">${link('https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=details', 'Planet X and SPHEREx')}</bdi>».
<button class="link" type="button" data-play-intro data-guide="play-intro">تشغيل المقدمة</button></p>

<h3 id="about-use">طريقة الاستخدام</h3>
<ul>
  <li><b>ابدأ:</b> اختر نقطة بداية، أو اضغط «تشغيل» على الشريط.</li>
  <li><b>تنقّل:</b> اسحب السماء لتتحرك، واستخدم عجلة الفأرة أو <kbd class="kbd">+</kbd> <kbd class="kbd">−</kbd> للتكبير.
    النقر على السماء يسأل قبل أن يحرّك شيئًا. ويمكنك أيضًا سحب المربع.</li>
  <li><b>فوق الصورة:</b> تغيّر العجلة حجم المجال (من 3′ إلى 48′) بدل تكبير السماء، ويحرّك السحب بقعة الإطار، وفي
    «قياس» تقيس النقرة ما نقرت عليه.</li>
  <li><b>البحث:</b> اضغط <kbd class="kbd">/</kbd> واكتب اسمًا بالعربية أو الإنجليزية، أو معنى (الراعي)، أو رقمًا من فهرس
    (${ltr('M104')}، ${ltr('NGC 6572')}) أو إحداثيات (${ltr('17 57 48.5 +04 41 36')}).</li>
  <li><b>قارن التواريخ:</b> «تقليب» يعرض الصور تباعًا. «تاريخان» يعرض التاريخ الأقدم بالأحمر والأحدث بالسماوي. «فرق» يعرض
    كل تاريخ مطروحًا منه السماء المعتادة: الجسم المتحرك يظهر زوجًا من الأبيض والداكن.</li>
  <li><b>الطول الموجي:</b> المقياس على الشريط يحدد لون خريطة السماء وكاشف الإطار معًا.</li>
  <li><b>قياس:</b> يفتح الأرقام التي وراء الصورة وأدوات الصورة. في عرض «تكديس» اسحب السهم لتكدّس الصور على سرعة واتجاه
    تختارهما؛ ويظهر بجانبه دائمًا اختباران (بلا إزاحة، وبالحركة المعاكسة).</li>
  <li><b>البحث في الفهرس:</b> يسرد نجوم ${ltr('Gaia DR3')} السريعة الحركة، أو مصادر ${ltr('CatWISE2020')} شديدة الاحمرار
    (الباردة)، في مجال العرض، ويعلّمها على السماء. هي مصادر من الفهارس، لا اكتشافات.</li>
  <li><b>إطارات أخرى:</b> افتح حتى ستة إطارات إضافية بجانب الإطار الرئيسي: وميض، تاريخان، فرق، طيف، سطوع، تكديس أو
    معلومات. لكل إطار تاريخه وكاشفه ونوعه، ويمكن ربط الإطارات لتتشارك التواريخ أو البقعة أو الكاشف.</li>
  <li><b>مساحات العمل:</b> تُحفظ الإطارات الإضافية في هذا المتصفح. احفظها باسم، أو صدّرها ملفًا، أو شاركها: رابط المشاركة
    يحملها.</li>
  <li><b>مشاركة:</b> تعطي رابطًا إلى العرض نفسه، وشيفرة لتضمينه في صفحة أخرى.</li>
  <li><b>المفاتيح:</b> <kbd class="kbd">Space</kbd> للتشغيل والإيقاف، و<kbd class="kbd">←</kbd> <kbd class="kbd">→</kbd> للتنقل
    بين الصور، و<kbd class="kbd">/</kbd> للبحث، و<kbd class="kbd">Esc</kbd> لإغلاق ما هو مفتوح.</li>
</ul>

<h3 id="about-method">المنهج</h3>
<p>يمسح SPHEREx السماء كلها كل ستة أشهر في 102 لون من الأشعة تحت الحمراء، من ${ltr('0.75')} إلى ${ltr('5.0 µm')}، بستة
كواشف. يرى كل بقعة بضع مرات خلال أيام (زيارة)، ثم مرة أخرى بعد نحو ستة أشهر (جولة مسح).</p>
<p>يأخذ سيما صور بقعة واحدة ويعرضها بترتيب التاريخ، مثل المقارِنات الوامضة التي اكتُشف بها بلوتو، ومثل
${link('http://byw.tools/wiseview', 'WiseView')}. قبل العرض تُضبط الصور حتى تتساوى النجوم المعتادة في السطوع، ولا يُقارن
إلا بين صور الكاشف نفسه. «فرق» هو كل تاريخ مطروحًا منه القيمة الوسطى لكل التواريخ. وفي «قياس» يُقاس موضع النجم في كل صورة
ويُرسم خط مستقيم يناسبها، ثم تُقارن النتيجة بفهرس Gaia.</p>
<p>الأفكار مأخوذة من مجالات تقارن الصور في عملها اليومي: حلقات صور الطقس، والأشعة الطبية (مطابقة السطوع)، ومسوح الأجرام
العابرة (صورة جديدة ومرجعية وفرق)، وعلوم المواطن (التمرّن على إجابة معروفة).</p>

<h3 id="about-targets">الأهداف الخمسة للاختبار</h3>
<p>يسمّي التحدي خمسة أهداف. صورها الحقيقية من SPHEREx تأتي مع الصفحة، فتفتح فورًا.</p>
<ul class="about-targets">${targets.map(target).join('')}</ul>

<h3 id="about-planet-x">الكوكب X</h3>
<p>«الكوكب X» اسم قديم لكوكب قد يوجد بعيدًا خلف نبتون ولم يُعثر عليه. كوكب كهذا سيكون باردًا خافتًا، وينجرف ببطء أمام النجوم.
في صور SPHEREx المأخوذة بفارق ستة أشهر سيبدو مثل قزم بني قريب: نقطة خافتة في مكان مختلف في كل تاريخ.</p>
<p>لا يدّعي سيما أنه وجد كوكبًا كهذا. التمرين «الكوكب المخفي» مختلَق، وعليه وسم
<span class="pill warn">${t('honest.simulated')}</span> في كل مكان. إنه يبيّن كيف سيبدو اكتشاف كهذا. وكل ما يسرده البحث عن
التغيّر مرشّح للتحقق، لا اكتشاف.</p>
<p><b>هل يستطيع SPHEREx رؤيته؟</b> تجيب ساحة التجربة بنموذج بسيط. ضع كوكبًا افتراضيًا على صورة الإطار واختر حجمه وبعده
ومقدار ما يعكسه من ضوء. يحسب سيما سطوعه في كل كاشف من الستة (ضوء الشمس المنعكس وتوهّجه الذاتي)، وكم سيتزحزح في سنة،
وهل تُظهره لقطة واحدة أو تكديس لقطات أمام الضجيج المقيس في تلك الرقعة. يخفت ضوء الشمس المنعكس عنه مع القوة الرابعة لبعده:
وفق هذا النموذج، في الرقع الخمس المرفقة، يظهر كوكب بحجم نبتون على بعد ${ltr('300 AU')} في لقطة واحدة، وعلى بعد
${ltr('500 AU')} يكون خافتًا بقدر الضجيج تقريبًا (لا يُظهره إلا تكديس نحو 25 لقطة يتبع مساره)، وعلى بعد ${ltr('800 AU')}
يحتاج نحو ألف لقطة. واختلاف منظره السنوي يحرّكه كثيرًا بين جولات المسح. كل ما في ساحة التجربة موسوم
<span class="pill warn">${t('honest.pretend')}</span> وبأنه نموذج، ويُرسم متقطعًا، ولا يدخل أبدًا في قياس أو قائمة أو رسم
بياني أو ملف تنزيل. <button class="link" type="button" data-open-sandbox data-guide="about-sandbox">افتح ساحة التجربة</button></p>

<h3 id="about-challenge">النقاط الثماني في التحدي</h3>
<table class="about-table">
  <thead><tr><th>يطلب التحدي</th><th>كيف يجيب سيما</th></tr></thead>
  <tbody>
    <tr><td>سهولة التحديث ببيانات جديدة</td><td>قائمة واحدة لإصدارات SPHEREx في سكربت البيانات؛ وخدمة صغيرة تجلب صور أي إحداثيات.</td></tr>
    <tr><td>استخدام مبتكر للنطاقات الـ102</td><td>مقياس طول موجي واحد يقود خريطة السماء والإطار؛ و«قياس» يبني طيفًا أثناء عرض الصور.</td></tr>
    <tr><td>جمع الصور أو طرحها عبر الزمن</td><td>«فرق» و«تاريخان» و«تكديس»؛ ودمج كل جولة مسح في أدوات الصورة.</td></tr>
    <tr><td>اختيار مجال الرؤية</td><td>حجم المجال من 3 إلى 48 دقيقة قوسية.</td></tr>
    <tr><td>طبقات من Gaia وWISE</td><td>تبويب «الطبقات» يرسم مصادر ${ltr('Gaia DR3')} و${ltr('AllWISE')} على الصورة؛ و«البحث في الفهرس» يسرد السريعة الحركة من ${ltr('Gaia DR3')} والباردة من ${ltr('CatWISE2020')}.</td></tr>
    <tr><td>الإحداثيات في العنوان، للتضمين</td><td>«مشاركة» تعطي رابطًا وشيفرة تضمين.</td></tr>
    <tr><td>عرض البيانات الوصفية مثل رايات التلوث</td><td>تفاصيل اللقطة في «قياس» وطبقة لرايات البكسل.</td></tr>
    <tr><td>استخدام أدوات مثل Astropy وAladin</td><td>Astropy في سكربتات البيانات؛ وAladin Lite يرسم السماء.</td></tr>
  </tbody>
</table>

<h3 id="about-limits">الحدود</h3>
<ul>
  <li>خريطة السماء متوسط سنة من التواريخ، فالأجسام المتحركة فيها مطموسة أو مُزاحة.</li>
  <li>الصور الحقيقية تأتي مع الصفحة للأهداف الخمسة فقط. أي بقعة أخرى تحتاج الخدمة الحية، وقد تستغرق عدة دقائق، وقد لا تكون
    تعمل. وبدونها يقول الإطار ذلك ويعرض تمرينًا موسومًا.</li>
  <li>البقع المجلوبة حيًّا قد لا يكون لها فهرس، فلا يُعلَّم فيها شيء ولا يُقاس.</li>
  <li>بكسل SPHEREx عرضه ${ltr('6.15″')}. النجم الذي يتحرك أقل من نحو ${ltr('4″')} في السنة لا تظهر له قفزة خلال سنة ونصف.</li>
  <li>المسافة (اختلاف المنظر) لا تُقاس من بضع جولات بفارق ستة أشهر؛ و«قياس» يعرض قيمة الفهرس.</li>
  <li>النجوم الساطعة تُشبع الكاشف. تُوسم مراكزها وتُقاس من البكسلات النظيفة حولها.</li>
  <li>«البحث في الفهرس» يسأل VizieR من متصفحك، وهو لا يعمل دائمًا؛ وعند الفشل تقول القائمة ذلك. يبحث في ${ltr('1°')} على
    الأكثر حول وسط العرض لـGaia و${ltr('0.5°')} لـCatWISE2020، وفي مصادر CatWISE الأسطع من 15 في ${ltr('W2')} فقط.</li>
  <li>ساحة التجربة نموذج بسيط: كوكب كروي بدرجة حرارة واحدة، يُرى على زاوية 90° من الشمس، ويُقرأ كل كاشف في وسط نطاقه،
    والتكديس يجمع جمعًا مثاليًا. الكواكب الحقيقية قد تكون أسطع في بعض الأطوال الموجية.</li>
  <li>صُمّم سيما لشاشة حاسوب، واختُبر أساسًا في Chrome.</li>
</ul>

<h3 id="about-ai">صُنع بمساعدة الذكاء الاصطناعي</h3>
<p>كُتبت شيفرة سيما وكثير من نصوصه بمساعدة أدوات برمجة بالذكاء الاصطناعي، منها Claude من Anthropic، بتوجيه الفريق
ومراجعته. الأرقام على الشاشة تأتي من الصور ومن الفهارس المسمّاة، لا من الذكاء الاصطناعي. وحيث تكون القيمة نموذجًا أو
محاكاة، تقول الصفحة ذلك. الترجمة العربية أُعدّت كذلك بمساعدة الذكاء الاصطناعي.</p>

<h3 id="about-sources">المصادر وشروطها</h3>
<p>لا تتبنّى ناسا المواقع الخارجة عن حكومة الولايات المتحدة. لكل مصدر أدناه شروط استخدامه.</p>
<ul class="about-sources">
  <li><b>صور SPHEREx وخريطة السماء كلها:</b> NASA/IPAC Infrared Science Archive (IRSA)،
    ${link('https://irsa.ipac.caltech.edu/Missions/spherex.html')}. تُوجد اللقطات بخدمات البحث في IRSA وتُقتطع من ملفات
    المستوى 2، باتباع ${link('https://caltech-ipac.github.io/irsa-tutorials/spherex/', 'SPHEREx tutorial notebooks')}.
    ${ltr('This work made use of IRSA, which is funded by NASA and operated by the California Institute of Technology.')}</li>
  <li><b>خرائط AllWISE وCatWISE2020:</b> من IRSA، ${link('https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W1')}.
    WISE مشروع مشترك بين جامعة كاليفورنيا في لوس أنجلوس ومختبر الدفع النفاث/Caltech، بتمويل من ناسا.</li>
  <li><b>${ltr('Gaia DR3')}:</b> أرشيف Gaia لوكالة الفضاء الأوروبية، ${link('https://gea.esac.esa.int/archive/')}، وVizieR.
    ${ltr('This work made use of data from the ESA mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC).')}</li>
  <li><b>VizieR وSIMBAD:</b> CDS، ستراسبورغ، فرنسا، ${link('https://vizier.cds.unistra.fr/')} و
    ${link('https://simbad.cds.unistra.fr/simbad/')}. مواضع الأماكن وحقائقها. و«البحث في الفهرس» يسأل مرايا VizieR في
    Harvard-Smithsonian CfA وفي IDIA، كيب تاون.</li>
  <li><b>نبتون في ساحة التجربة:</b> NASA's Neptune Fact Sheet،
    ${link('https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html')}.</li>
  <li><b>أسماء النجوم:</b> IAU Working Group on Star Names، ${link('https://www.pas.rochester.edu/~emamajek/WGSN/')}.</li>
  <li><b>الأسماء العربية للنجوم:</b> ويكيبيديا، ${link('https://en.wikipedia.org/wiki/List_of_Arabic_star_names')}،
    النص بترخيص ${ltr('CC BY-SA 4.0')}.</li>
  <li><b>أجرام مسييه وNGC وIC:</b> OpenNGC من Mattia Verga، ${link('https://github.com/mattiaverga/OpenNGC')}، بترخيص
    ${ltr('CC BY-SA 4.0')}.</li>
  <li><b>التسميات والنصوص العربية القصيرة:</b> Wikidata، ${link('https://www.wikidata.org')} (${ltr('CC0')})، وSimple English
    Wikipedia (${ltr('CC BY-SA 4.0')}). كل بطاقة مكان تسمّي مصادرها.</li>
  <li><b>مكتبة السماء:</b> ${ltr('Aladin Lite 3.8.2')} من CDS، ${link('https://aladin.cds.unistra.fr/AladinLite/')}، بترخيص
    ${ltr('GPL 3.0')}.</li>
  <li><b>الخطوط:</b> Archivo وAref Ruqaa وNoto Sans Arabic، بترخيص SIL Open Font License 1.1.</li>
  <li><b>التحدي:</b> NASA Space Apps، ${link('https://www.spaceappschallenge.org/')}، و
    ${link('https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources', 'صفحة المصادر')}.</li>
</ul>`;
}
