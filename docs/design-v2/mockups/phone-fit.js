// The phone fit layout (BEGINNER-AND-MOBILE 11.1), as the build would do it: the picture is sized so
// the sheet fits under the frame, never over the picture, and never below 240 px.
(function () {
  if (innerWidth >= 700) return;
  const frame = document.querySelector('.dframe');
  const sheet = document.querySelector('.fitsheet');
  if (!frame || !sheet) return;
  const want = Number(document.body.dataset.sheetH || 120);
  const pic = frame.querySelector('.pic');
  frame.style.setProperty('--pic', '300px');
  const fixed = frame.getBoundingClientRect().height - pic.getBoundingClientRect().height;
  const top = frame.getBoundingClientRect().top;
  const p = Math.max(240, Math.min(innerWidth - 40, innerHeight - top - fixed - 8 - want));
  frame.style.setProperty('--pic', p + 'px');
  document.documentElement.style.setProperty('--sheet-top', frame.getBoundingClientRect().bottom + 8 + 'px');
})();
