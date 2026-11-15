/**
 * The intro's name, written as a constellation (DESIGN.md "Intro", step 2). A shooting star draws
 * a star chart's figure through the letters of سيما, right to left as it is written; each star
 * lights as it arrives. The two dots of ي light last, the brightest pair. Then the letters
 * condense out of the figure and the figure fades: its stars are marks, not real stars.
 *
 * Built from plain elements that move only by transform, opacity and filter, so the compositor
 * runs it while the page's main thread is busy starting.
 * Owner: the intro (src/intro/, src/styles/intro.css).
 */
import { T } from './scene.ts';

/** سيما in Amiri Bold (SIL OFL), as outlines: seen, ya, meem, alef. Box: x 600–1000, y 248–594. */
const WORD = [
  'M867 371Q878 371 869 389Q878 397 893 397Q916 397 932 354Q934 348 939 349Q944 351 943 357L940 369Q943 372 948 374Q952 376 957 378Q962 380 967 380Q971 381 974 381Q972 370 969 365Q966 361 970 354L980 337Q986 331 989 345Q994 370 989 392Q983 414 971 422Q970 423 966 423Q942 424 924 409Q911 435 890 440Q868 446 846 423Q825 448 812 448Q805 448 802 437Q801 430 800 425Q799 408 812 406Q846 403 861 376Q864 371 867 371Z',
  'M727 428Q727 445 719 449Q716 450 714 450Q704 450 705 431Q705 414 712 401Q734 363 760 365Q770 367 775 375Q793 408 818 406Q826 405 830 413Q831 414 831 415Q832 417 832 418Q832 433 823 443Q818 448 812 448Q791 447 776 435Q766 427 752 409Q749 406 738 414Q727 423 727 428Z',
  'M719 402Q725 401 724 415Q724 429 731 440Q739 453 747 457Q749 458 753 459Q756 460 762 462Q774 466 782 469Q790 474 790 483Q789 509 785 516Q782 523 774 519Q758 510 749 506Q739 501 734 501Q725 501 706 510Q697 514 690 516Q682 519 676 519Q668 519 665 508Q662 497 664 488Q666 478 676 477Q701 475 713 468Q701 441 710 415Q715 402 719 402Z',
  'M624 261Q631 248 633 263Q640 328 641 382Q642 436 643 447Q644 475 676 477Q687 477 688 487Q689 489 689 492Q688 496 688 500Q686 508 684 514Q682 519 676 519Q627 519 624 471Q623 460 623 442Q622 423 621 398Q620 374 617 349Q614 324 609 297Q608 288 611 283L624 261Z',
];
/** The two dots of ي, drawn as stars: centre x, y and radius. */
const DOTS: [number, number, number][] = [
  [800.3, 560.4, 25.1],
  [840.4, 551.0, 21.6],
];
/** "Sıma" in Amiri Bold; the star is the dot of the i. Box: x 691–909, y 641–725. */
const LATIN =
  'M714 655Q718 655 722 656Q726 657 731 658Q731 662 732 666Q732 670 732 675Q732 676 731 676Q731 676 731 676Q730 676 729 676Q728 675 728 675Q728 673 727 670Q725 667 724 665Q722 662 720 661Q717 659 714 659Q712 659 710 660Q708 661 707 663Q705 665 705 668Q705 671 708 674Q710 677 714 680Q717 683 720 685Q724 687 727 690Q731 692 733 696Q735 700 735 706Q735 712 732 716Q729 720 724 723Q719 725 713 725Q708 725 703 724Q698 723 693 722Q693 720 692 716Q692 713 691 709Q691 706 691 705Q691 704 692 704Q694 703 694 703Q695 703 695 704Q696 706 697 709Q698 712 701 715Q703 717 706 719Q708 721 712 721Q716 721 719 718Q722 716 722 711Q722 708 720 705Q719 703 716 701Q714 699 711 697Q709 695 707 694Q703 691 700 689Q696 686 694 683Q692 679 692 674Q692 668 695 664Q698 660 703 657Q708 655 714 655ZM762 692V709Q762 712 763 714Q763 717 763 719Q764 719 765 720Q766 720 767 720Q768 720 769 721Q770 721 769 722Q769 724 769 724Q766 724 763 724Q759 724 756 724Q752 724 749 724Q745 724 742 724Q741 724 741 722Q741 721 742 721Q742 720 744 720Q745 720 747 720Q748 719 748 719Q749 717 749 715Q749 712 749 709V697Q749 697 749 695Q749 693 749 691Q749 689 748 689Q748 688 746 687Q745 687 743 687Q742 687 742 687Q742 687 741 686Q741 685 741 684Q742 683 742 683Q746 683 750 682Q753 681 757 680Q760 679 762 678Q762 678 763 679Q764 680 764 680Q763 680 763 682Q763 685 763 686Q762 687 762 689Q762 692 762 692ZM810 678Q815 678 818 680Q821 682 823 687Q825 685 828 683Q831 681 834 679Q837 678 840 678Q846 678 849 681Q852 683 853 689Q854 694 854 702V709Q854 709 854 710Q854 710 854 710Q854 713 854 715Q854 717 855 719Q855 719 856 720Q857 720 859 720Q861 720 861 721Q862 721 862 722Q861 724 861 724Q858 724 854 724Q850 724 847 724Q844 724 840 724Q837 724 834 724Q834 724 834 722Q834 721 834 721Q835 720 837 720Q839 720 840 719Q840 717 840 715Q840 712 840 709V701Q840 697 840 694Q839 691 838 688Q836 686 833 686Q831 686 829 687Q827 688 825 690Q824 691 824 692V693Q824 695 824 697Q824 700 824 702V709Q824 712 824 715Q824 717 825 719Q825 719 827 720Q828 720 829 720Q831 720 831 721Q832 721 832 722Q832 724 831 724Q828 724 825 724Q821 724 818 724Q814 724 811 724Q807 724 804 724Q804 724 804 722Q804 721 804 721Q805 720 808 720Q810 720 810 719Q811 717 811 715Q811 713 811 710Q811 710 811 710Q811 709 811 709V701Q811 697 810 694Q810 691 808 688Q807 686 804 686Q802 686 800 687Q798 688 796 690Q795 691 795 692V709Q795 712 795 714Q795 717 796 719Q796 719 797 720Q798 720 800 720Q801 720 801 721Q802 721 802 722Q802 724 801 724Q799 724 795 724Q791 724 788 724Q785 724 781 724Q777 724 774 724Q774 724 774 722Q774 721 774 721Q775 720 776 720Q778 720 779 720Q780 719 781 719Q781 717 781 715Q781 712 781 709V697Q781 697 781 695Q781 693 781 691Q781 689 780 689Q780 688 779 687Q777 687 776 687Q774 687 774 687Q774 687 774 686Q774 685 774 684Q774 683 774 683Q778 683 782 682Q786 681 789 680Q792 679 794 678Q795 678 795 679Q796 680 796 680Q796 680 796 682Q795 683 795 684Q795 686 795 686Q795 686 795 686Q795 686 796 686Q797 684 800 682Q802 681 805 679Q808 678 810 678ZM887 678Q892 678 895 680Q899 682 901 685Q903 689 903 693V713Q903 715 904 716Q904 717 905 717Q906 717 907 717Q908 716 908 716Q909 716 909 718Q909 718 909 719Q908 720 906 721Q904 722 902 724Q900 725 898 725Q896 725 893 723Q891 721 890 719Q890 720 888 721Q885 722 883 724Q880 725 879 725Q875 725 872 723Q869 721 867 718Q865 715 865 712Q865 709 867 707Q868 705 870 704Q872 703 876 702Q879 701 883 699Q887 698 890 697V692Q890 688 888 685Q886 682 883 682Q880 682 879 684Q878 687 877 690Q877 692 876 693Q874 695 872 695Q870 695 868 693Q866 692 866 690Q866 689 867 688Q867 687 868 686Q868 685 870 684Q872 683 875 681Q877 680 881 679Q884 678 887 678ZM885 718Q887 718 888 717Q890 716 890 715V701Q888 702 886 702Q884 703 883 704Q881 706 880 708Q879 710 879 711Q879 714 881 716Q883 718 885 718Z';
const LATIN_STAR: [number, number, number] = [754.8, 660.5, 19.5];

/** The word's box in its outlines' units. */
const BOX = { x: 600, y: 248, w: 400, h: 346 };
const LATIN_BOX = { x: 688, y: 638, w: 224, h: 90 };
/** The word's own width, in outline units (for sizing). */
const WORD_W = 383;

/** The figure: points on the letters' centre lines, in writing order, and each star's size. */
const FIGURE: [number, number, number][] = [
  // س: three teeth
  [976, 344, 5.5],
  [963, 410, 3.4],
  [930, 357, 4.6],
  [900, 420, 3.4],
  [866, 379, 4.2],
  [836, 416, 3],
  // ي
  [800, 413, 3.4],
  [757, 386, 4.4],
  [713, 425, 3.2],
  // م
  [722, 470, 3.4],
  [783, 496, 4.2],
  [722, 506, 3],
  [668, 504, 3.4],
  // ا
  [631, 490, 3],
  [624, 440, 3],
  [619, 330, 3.6],
  [617, 268, 5.4],
];

/** The pen's pace along the figure: CSS cubic-bezier(.45,.05,.55,.95), and its inverse. */
const PEN_EASE = 'cubic-bezier(.45,.05,.55,.95)';
function penTime(share: number): number {
  const b = (t: number, p1: number, p2: number) =>
    3 * p1 * t * (1 - t) ** 2 + 3 * p2 * t * t * (1 - t) + t ** 3;
  const solve = (f: (t: number) => number, y: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (f(m) < y) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  // The curve's parameter where it has gone `share` of the way, then the time there.
  return b(
    solve((t) => b(t, 0.05, 0.95), share),
    0.45,
    0.55,
  );
}

/** A four-point star, as an SVG path (k: how thin its waist is). */
function sparkle(cx: number, cy: number, r: number, k = 0.12): string {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 - 90) * (Math.PI / 180);
    const m = a + Math.PI / 4;
    const n = a + Math.PI / 2;
    const p = (v: number) => v.toFixed(2);
    if (i === 0) d += `M${p(cx + r * Math.cos(a))} ${p(cy + r * Math.sin(a))}`;
    d += `Q${p(cx + r * k * 0.55 * Math.cos(m))} ${p(cy + r * k * 0.55 * Math.sin(m))} ${p(cx + r * Math.cos(n))} ${p(cy + r * Math.sin(n))}`;
  }
  return d + 'Z';
}

const svg = (box: { x: number; y: number; w: number; h: number }, body: string, cls = '') =>
  `<svg class="${cls}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" aria-hidden="true">${body}</svg>`;

/** The word's outlines, as a mask for the glint. */
function wordMask(): string {
  const body = WORD.map((d) => `<path d="${d}"/>`).join('');
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
}

/** The word's width on screen for a disc of radius `r0` (CSS px). */
export function markWidth(r0: number): number {
  return Math.max(120, Math.min(240, r0 * 0.7));
}

/**
 * Fills `ar` with the constellation and `la` with "Sima", sized for a disc of radius `r0`, and
 * plays the constellation from `lead` ms. Reduced motion: the finished name, faded in.
 */
export function showMark(
  ar: HTMLElement,
  la: HTMLElement,
  r0: number,
  lead: number,
  reduced: boolean,
): void {
  const k = markWidth(r0) / WORD_W;
  const X = (x: number) => (x - BOX.x) * k;
  const Y = (y: number) => (y - BOX.y) * k;
  ar.style.width = `${(BOX.w * k).toFixed(1)}px`;
  ar.style.height = `${(BOX.h * k).toFixed(1)}px`;
  la.style.width = `${(LATIN_BOX.w * k * 0.85).toFixed(1)}px`;
  la.style.height = `${(LATIN_BOX.h * k * 0.85).toFixed(1)}px`;

  const [lx, ly, lr] = LATIN_STAR;
  la.innerHTML = svg(LATIN_BOX, `<path d="${LATIN}"/><path d="${sparkle(lx, ly, lr, 0.2)}"/>`);
  const dots = DOTS.map(
    ([x, y, r]) => `
      <span class="im-dot" style="left:${X(x).toFixed(1)}px;top:${Y(y).toFixed(1)}px;--r:${(r * k).toFixed(2)}px">
        <i class="im-halo"></i>${svg({ x: -1, y: -1, w: 2, h: 2 }, `<path d="${sparkle(0, 0, 0.98, 0.03)}"/>`, 'im-rays')}${svg({ x: -1, y: -1, w: 2, h: 2 }, `<path d="${sparkle(0, 0, 1)}"/>`, 'im-core')}
      </span>`,
  ).join('');
  ar.innerHTML = `
    <div class="im-cam">
      ${svg(BOX, WORD.map((d) => `<path d="${d}"/>`).join(''), 'im-word')}
      <div class="im-glint" style="mask-image:${wordMask()};-webkit-mask-image:${wordMask()}"><i></i></div>
      <div class="im-lines"></div>
      <div class="im-stars"></div>
      <span class="im-pen"><i></i></span>
      ${dots}
    </div>`;
  const q = <E extends Element>(s: string) => ar.querySelector<E>(s)!;
  const at = (s: number) => lead + s * 1000;
  const ms = (a: number, b: number) => (b - a) * 1000;
  const word = q<SVGElement>('.im-word');
  const dotEls = [...ar.querySelectorAll<HTMLElement>('.im-dot')];

  if (reduced) {
    for (const el of [word, ...dotEls]) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { delay: lead, duration: 400, fill: 'both' });
    }
    return;
  }

  // The camera: a slow pull back, the whole time the name is built.
  q<HTMLElement>('.im-cam').animate([{ transform: 'scale(1.07)' }, { transform: 'none' }], {
    delay: lead,
    duration: ms(0, T.ink[1] + 0.4),
    easing: 'cubic-bezier(.2,.6,.2,1)',
    fill: 'both',
  });

  // The figure: lengths along it, and when the pen reaches each point.
  const [p0, p1] = T.pen;
  const len = [0];
  for (let i = 1; i < FIGURE.length; i++) {
    const [ax, ay] = FIGURE[i - 1]!;
    const [bx, by] = FIGURE[i]!;
    len.push(len[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  const total = len[len.length - 1]!;
  const when = (i: number) => p0 + (p1 - p0) * penTime(len[i]! / total);
  const angle = (i: number) => {
    const [ax, ay] = FIGURE[i - 1]!;
    const [bx, by] = FIGURE[i]!;
    return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  };

  // The lines, one segment at a time, each drawn as the pen crosses it.
  const lines = q<HTMLElement>('.im-lines');
  for (let i = 1; i < FIGURE.length; i++) {
    const [ax, ay] = FIGURE[i - 1]!;
    const seg = document.createElement('i');
    seg.style.left = `${X(ax).toFixed(1)}px`;
    seg.style.top = `${Y(ay).toFixed(1)}px`;
    seg.style.width = `${((len[i]! - len[i - 1]!) * k).toFixed(1)}px`;
    lines.append(seg);
    const a = angle(i).toFixed(2);
    seg.animate(
      [{ transform: `rotate(${a}deg) scaleX(0)` }, { transform: `rotate(${a}deg) scaleX(1)` }],
      {
        delay: at(when(i - 1)),
        duration: ms(when(i - 1), when(i)),
        easing: 'linear',
        fill: 'both',
      },
    );
  }

  // The stars: each pops as the pen arrives.
  const stars = q<HTMLElement>('.im-stars');
  FIGURE.forEach(([x, y, m], i) => {
    const s = document.createElement('i');
    s.style.left = `${X(x).toFixed(1)}px`;
    s.style.top = `${Y(y).toFixed(1)}px`;
    s.style.setProperty('--m', `${(m * k).toFixed(2)}px`);
    if (m > 4)
      s.innerHTML = svg({ x: -1, y: -1, w: 2, h: 2 }, `<path d="${sparkle(0, 0, 1, 0.1)}"/>`);
    stars.append(s);
    s.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.9)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ],
      { delay: at(when(i)) - 40, duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
    );
  });

  // The pen: a small comet running the figure just ahead of the line.
  const pen = q<HTMLElement>('.im-pen');
  const frames: Keyframe[] = [];
  FIGURE.forEach(([x, y], i) => {
    const pos = `translate(${X(x).toFixed(1)}px, ${Y(y).toFixed(1)}px)`;
    const offset = len[i]! / total;
    if (i > 0) frames.push({ offset, transform: `${pos} rotate(${angle(i).toFixed(2)}deg)` });
    if (i < FIGURE.length - 1)
      frames.push({ offset, transform: `${pos} rotate(${angle(i + 1).toFixed(2)}deg)` });
  });
  pen.animate(frames, { delay: at(p0), duration: ms(p0, p1), easing: PEN_EASE, fill: 'both' });
  pen.firstElementChild!.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 0.94 }, { opacity: 0 }],
    { delay: at(p0), duration: ms(p0, p1), fill: 'both' },
  );

  // The sign: the two dots of ي ignite, the brightest stars of the figure, and keep a slow twinkle.
  dotEls.forEach((dot, i) => {
    const t = at(T.sign + i * 0.17);
    const core = dot.querySelector('.im-core')!;
    core.animate(
      [
        { transform: 'scale(0) rotate(-45deg)', opacity: 0 },
        { transform: 'scale(2.2) rotate(0deg)', opacity: 1, offset: 0.35 },
        { transform: 'none', opacity: 1 },
      ],
      { delay: t, duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
    );
    core.animate([{ opacity: 1 }, { opacity: 0.72 }, { opacity: 1 }], {
      delay: t + 1800,
      duration: 2600 + i * 700,
      iterations: Infinity,
      easing: 'ease-in-out',
    });
    dot.querySelector('.im-rays')!.animate(
      [
        { transform: 'scale(.3)', opacity: 0 },
        { transform: 'none', opacity: 0.9, offset: 0.25 },
        { transform: 'scale(1.25)', opacity: 0 },
      ],
      { delay: t, duration: 1000, fill: 'both' },
    );
    dot
      .querySelector('.im-halo')!
      .animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.25 }, { opacity: 0.05 }], {
        delay: t,
        duration: 1500,
        fill: 'both',
      });
  });

  // The letters condense out of the figure; the figure's marks give way.
  const [i0, i1] = T.ink;
  const blur = (12 * k).toFixed(1);
  word.animate(
    [
      { opacity: 0, filter: `blur(${blur}px)` },
      { opacity: 1, filter: 'blur(0px)' },
    ],
    {
      delay: at(i0),
      duration: ms(i0, i1),
      easing: 'cubic-bezier(.3,0,.2,1)',
      fill: 'both',
    },
  );
  lines.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: at(i0 + 0.2),
    duration: ms(i0, i1) - 200,
    fill: 'forwards',
  });
  stars.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: at(i0 + 0.5),
    duration: 900,
    fill: 'forwards',
  });

  // One soft glint across the finished word, right to left.
  const [g0, g1] = T.glint;
  q<HTMLElement>('.im-glint > i').animate(
    [
      { transform: `translateX(${(BOX.w * k).toFixed(1)}px) skewX(-18deg)` },
      { transform: `translateX(-${(90 * k).toFixed(1)}px) skewX(-18deg)` },
    ],
    { delay: at(g0), duration: ms(g0, g1), easing: 'cubic-bezier(.5,0,.4,1)', fill: 'both' },
  );
}
