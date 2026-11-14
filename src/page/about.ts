/**
 * The About dialog (GEN-6, H10, O-W4): what Sima is, how to use it, the method, the five test
 * targets, Planet X, the challenge's eight considerations, the limits, the AI disclosure, and
 * every source with its link and data terms (SPEC 6.1, 13, risk 6). Owner: lane F.
 *
 * Facts about the five targets are computed from core/targets.ts, which names the catalogue each
 * value came from (H4, H9). Nothing here is typed from memory.
 */
import { TARGETS } from '../core/targets.ts';
import { icon } from '../shell/icons.ts';
import type { Target } from '../core/types.ts';

/** Light-years in a parsec (IAU). */
const LY_PER_PC = 3.26156;

/** About's sections, for the contents row: heading id and short name. */
const SECTIONS: readonly [string, string][] = [
  ['about-use', 'How to use'],
  ['about-method', 'Method'],
  ['about-targets', 'Targets'],
  ['about-planet-x', 'Planet X'],
  ['about-challenge', 'Challenge'],
  ['about-limits', 'Limits'],
  ['about-ai', 'AI help'],
  ['about-sources', 'Sources'],
];

/** Fills the About dialog. Called once by shell.ts. */
export function startAbout(): void {
  const dialog = document.getElementById('about');
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.setAttribute('aria-labelledby', 'about-title');
  dialog.innerHTML = `
    <header class="dialog-head">
      <h2 id="about-title"><span lang="ar" dir="rtl" class="about-ar">سيما</span> About Sima</h2>
      <button class="icon-btn sm" data-dialog-close aria-label="Close About" data-tip="Close">${icon('close')}</button>
    </header>
    <nav class="about-toc" aria-label="Sections of About">
      ${SECTIONS.map(([id, name]) => `<a class="link" href="#${id}" data-section="${id}">${name}</a>`).join('')}
    </nav>
    <div class="about-body" data-scroll tabindex="0">${body()}</div>`;
  dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
  // The contents row scrolls the body to a section; the page's address stays as it is.
  dialog.querySelector('.about-toc')?.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-section]') : null;
    const to = a && document.getElementById(a.dataset.section ?? '');
    if (!to) return;
    e.preventDefault();
    to.scrollIntoView({ block: 'start' });
    to.setAttribute('tabindex', '-1');
    to.focus({ preventScroll: true });
  });
}

/** Opens About at its top. */
export function openAbout(): void {
  const dialog = document.getElementById('about');
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.showModal();
  const body = dialog.querySelector('.about-body');
  if (body) body.scrollTop = 0;
}

function link(href: string, text = href.replace(/^https?:\/\//, '')): string {
  return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
}

/** One target's line, with its catalogue motion and distance where the parallax is good. */
function target(t: Target): string {
  const motion = Math.hypot(t.pmra, t.pmdec) / 1000; // arcseconds a year
  const facts = [`moves ${motion < 1 ? motion.toFixed(3) : motion.toFixed(2)}″ a year on the sky`];
  // Distance from the parallax only where it is large enough to trust (over 20 mas).
  if (t.plx !== null && t.plx > 20) {
    const ly = (1000 / t.plx) * LY_PER_PC;
    facts.push(`about ${ly < 20 ? ly.toFixed(1) : Math.round(ly)} light-years away`);
  }
  return `<li><b>${t.name}</b>: ${t.line.toLowerCase()}. Catalogue: ${facts.join(', ')}
    <span class="about-source">(${t.values})</span>.</li>`;
}

function body(): string {
  return `
<p class="about-lead">سيما, written Sima, is Arabic for “a sign or a mark”. Sima is a workspace on the
infrared sky of NASA's SPHEREx telescope. Put a square on any spot of the sky, and the frame plays the
real pictures of that spot in date order. Stars stay still. Anything that moves or changes stands out.</p>
<p>Made by team SIMA, in Madinah, for the NASA Space Apps Challenge 2026,
${link('https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=details', '“Planet X and SPHEREx”')}.</p>

<h3 id="about-use">How to use it</h3>
<ul>
  <li><b>Start:</b> press a starting point on the welcome card, or press Play on the bar.</li>
  <li><b>Travel:</b> drag the sky to move, and use the wheel or <kbd class="kbd">+</kbd> <kbd class="kbd">−</kbd> to zoom.
    A click on the sky asks before it moves anything: press “Move the frame here”. You can also drag the square.</li>
  <li><b>Over the picture:</b> the wheel changes the field size (3′ to 48′) instead of zooming the sky,
    a drag moves the frame's spot, and in Measure a tap measures what you tapped.</li>
  <li><b>Search:</b> press <kbd class="kbd">/</kbd> and type a name in English or Arabic, a meaning (“shepherd”), a catalogue
    number (M104, NGC 6572) or coordinates (17 57 48.5 +04 41 36).</li>
  <li><b>Compare dates:</b> Flip plays the pictures. Two dates shows the earlier date in red and the later in cyan.
    Difference shows each date minus the typical sky: a mover is a white and dark pair.</li>
  <li><b>Wavelength:</b> the scale on the bar sets both the sky map's colour and the frame's detector.</li>
  <li><b>Measure:</b> opens the numbers behind the picture and the picture tools.</li>
  <li><b>Share:</b> gives a link to the same view, and code to put it in another web page.</li>
  <li><b>Keys:</b> <kbd class="kbd">Space</kbd> plays or pauses, <kbd class="kbd">←</kbd> <kbd class="kbd">→</kbd> step
    through the pictures, <kbd class="kbd">/</kbd> goes to search, <kbd class="kbd">Esc</kbd> closes what is open.</li>
</ul>

<h3 id="about-method">The method</h3>
<p>SPHEREx maps the whole sky every six months in 102 colours of infrared light, from 0.75 to 5.0 µm, with six
detectors. It sees each spot a few times within days (a visit), and again about six months later (a pass).</p>
<p>Sima takes the pictures of one spot and plays them in date order, like the blink comparators astronomers used
to find Pluto and like ${link('http://byw.tools/wiseview', 'WiseView')}. Before they play, the pictures are scaled so
that typical stars match in brightness, and only pictures of the same detector are compared. Difference is each date
minus the middle value of all dates. In Measure, the position of a star is measured in each picture and a straight
line is fitted to them, and the result is compared with the Gaia catalogue.</p>
<p>The ideas come from fields that compare pictures for a living: weather loops (hard cuts, a speed limit),
radiology (matching brightness), transient surveys (new, reference and difference cutouts) and citizen science
(warming up on a known answer).</p>

<h3 id="about-targets">The five test targets</h3>
<p>The challenge names five targets. Their real SPHEREx pictures come with the page, so they open at once.</p>
<ul class="about-targets">${TARGETS.map(target).join('')}</ul>

<h3 id="about-planet-x">Planet X</h3>
<p>“Planet X” is the old name for a planet that might exist far beyond Neptune and has not been found. Such a
planet would be cold and faint, and it would drift slowly against the stars. In SPHEREx pictures taken six months
apart it would look like a nearby brown dwarf: a faint dot that is in a different place on each date.</p>
<p>Sima does not claim to have found one. The practice “The hidden planet” is made up, and it is labelled
<span class="pill warn">Simulated</span> everywhere. It shows what such a find would look like. Anything the change
search lists is a candidate to check, never a discovery.</p>

<h3 id="about-challenge">The challenge's eight points</h3>
<table class="about-table">
  <thead><tr><th>The challenge asks for</th><th>How Sima answers</th></tr></thead>
  <tbody>
    <tr><td>Easy to update with new data</td><td>One list of SPHEREx releases in the data script; a small service fetches the pictures of any coordinate.</td></tr>
    <tr><td>Creative use of the 102 bands</td><td>One wavelength scale drives the sky map and the frame; Measure builds a spectrum as the pictures play.</td></tr>
    <tr><td>Add or subtract pictures taken at different times</td><td>Difference, Two dates and Stack; combining each pass in the picture tools.</td></tr>
    <tr><td>Let users choose the field of view</td><td>Field size from 3 to 48 arcminutes.</td></tr>
    <tr><td>Overlays from Gaia and WISE</td><td>The Layers tab draws Gaia DR3 and AllWISE sources on the picture.</td></tr>
    <tr><td>Coordinates in the address, for embedding</td><td>Share gives a link and an embed code.</td></tr>
    <tr><td>Show metadata such as contamination flags</td><td>Exposure details in Measure and a pixel-flags layer.</td></tr>
    <tr><td>Use tools like Astropy and Aladin</td><td>Astropy in the data scripts; Aladin Lite draws the sky.</td></tr>
  </tbody>
</table>

<h3 id="about-limits">Limits</h3>
<ul>
  <li>The sky map is an average of a year of dates. Moving objects are blurred or shifted on it.</li>
  <li>Real pictures come with the page for the five test targets only. Any other spot needs the live service,
    which can take several minutes, and may not be running. Without it, the frame says so and offers a labelled
    practice.</li>
  <li>Spots fetched live may have no catalogue, so nothing is marked or measured there.</li>
  <li>A SPHEREx pixel is 6.15″ across. A star that moves less than about 4″ a year does not show a jump over a year
    and a half.</li>
  <li>Distance (parallax) cannot be measured from a few passes six months apart; Measure shows the catalogue value.</li>
  <li>Bright stars overload the detector. Their centres are flagged and measured from the clean pixels around them.</li>
  <li>Sima is made for a desktop screen and has been tested mainly in Chrome.</li>
</ul>

<h3 id="about-ai">Made with AI help</h3>
<p>The code and much of the text of Sima were written with AI coding assistants, including Claude by Anthropic,
directed and checked by the team. The numbers on screen come from the pictures and from the named catalogues, not
from an AI. Where a value is a model or a simulation, the page says so.</p>

<h3 id="about-sources">Sources and their terms</h3>
<p>NASA does not endorse sites outside the U.S. government. Each source below has its own terms of use.</p>
<ul class="about-sources">
  <li><b>SPHEREx pictures and the all-sky map:</b> NASA/IPAC Infrared Science Archive (IRSA),
    ${link('https://irsa.ipac.caltech.edu/Missions/spherex.html')}. Exposures are found with IRSA's search services
    and cut out from the Level 2 files. Following the
    ${link('https://caltech-ipac.github.io/irsa-tutorials/spherex/', 'SPHEREx tutorial notebooks')}.
    This work made use of IRSA, which is funded by NASA and operated by the California Institute of Technology.</li>
  <li><b>AllWISE maps and CatWISE2020:</b> from IRSA, ${link('https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W1')}.
    WISE is a joint project of the University of California, Los Angeles, and the Jet Propulsion Laboratory/Caltech,
    funded by NASA.</li>
  <li><b>Gaia DR3:</b> ESA's Gaia archive, ${link('https://gea.esac.esa.int/archive/')}, and VizieR. This work made
    use of data from the ESA mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC).</li>
  <li><b>VizieR and SIMBAD:</b> CDS, Strasbourg, France, ${link('https://vizier.cds.unistra.fr/')} and
    ${link('https://simbad.cds.unistra.fr/simbad/')}. Positions and facts of places.</li>
  <li><b>Star names:</b> IAU Working Group on Star Names, ${link('https://www.pas.rochester.edu/~emamajek/WGSN/')}.</li>
  <li><b>Arabic star names:</b> Wikipedia, ${link('https://en.wikipedia.org/wiki/List_of_Arabic_star_names')},
    text under CC BY-SA 4.0.</li>
  <li><b>Messier, NGC and IC objects:</b> OpenNGC by Mattia Verga, ${link('https://github.com/mattiaverga/OpenNGC')},
    under CC BY-SA 4.0.</li>
  <li><b>Arabic labels and short texts:</b> Wikidata, ${link('https://www.wikidata.org')} (CC0), and Simple English
    Wikipedia (CC BY-SA 4.0). Each place card names its own sources.</li>
  <li><b>Sky library:</b> Aladin Lite 3.8.2 by CDS, ${link('https://aladin.cds.unistra.fr/AladinLite/')}, under the
    GPL 3.0 licence.</li>
  <li><b>Fonts:</b> Archivo and Reem Kufi, under the SIL Open Font License 1.1.</li>
  <li><b>The challenge:</b> NASA Space Apps, ${link('https://www.spaceappschallenge.org/')}, and its
    ${link('https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources', 'resources page')}.</li>
</ul>`;
}
