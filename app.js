// The parts of the page that move by script. Plain JavaScript, no framework, no other
// files: it reads the data block the builder embeds in index.html. The page already shows
// every final value, so without this script, or with reduced motion, nothing changes.
(function () {
  'use strict';

  var COUNT_MS = 1800;
  var STEP_MS = 1300;
  var ACCENT = '#68B2E0';

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function readData() {
    var block = document.getElementById('site-data');
    if (!block) return null;
    try {
      return JSON.parse(block.textContent);
    } catch (error) {
      return null;
    }
  }

  function isCount(value) {
    return typeof value === 'number' && value >= 0 && Math.floor(value) === value;
  }

  // Runs start once the document has been parsed, so whatever reads the page as it was
  // built (at DOMContentLoaded) sees the first values before the first change.
  function whenParsed(start) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  // The numbers count up from 0 with the design's ease-out and stop on their final value.
  // Each number element names its value with data-count: a key of the data block's
  // `stats`, or "fixed" for a fact written in the page itself.
  function countUp(data) {
    var stats = (data && data.stats) || {};
    var counters = [];
    var elements = document.querySelectorAll('[data-count]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.getAttribute('data-count');
      var final = key === 'fixed' ? Number(el.textContent.trim()) : stats[key];
      if (isCount(final)) counters.push({ el: el, final: final });
    }
    if (!counters.length) return;

    function show(t) {
      var ease = 1 - Math.pow(1 - t, 3);
      for (var j = 0; j < counters.length; j++) {
        counters[j].el.textContent = String(Math.round(counters[j].final * ease));
      }
    }

    show(0);
    whenParsed(function () {
      var start = performance.now();
      // Each value is taken from the time it is shown, not from when the frame began.
      function frame() {
        var t = Math.min(1, Math.max(0, performance.now() - start) / COUNT_MS);
        show(t);
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // The build panel replays `latest_builds`, newest first, as the design does: steps 0-4
  // make the row with that index current, step 5 is merged, step 6 holds the merged view,
  // and the tick after it moves to the next build at step 0. After the last build it
  // starts again from the newest. While the page shows a live build, the panel is left as
  // built: the data is as of the last refresh, and only the cursor and dot move, by CSS.
  function replay(data) {
    if (!data || data.live) return;
    var builds = data.latest_builds;
    if (!builds || !builds.length) return;
    var panel = document.querySelector('[data-region="terminal"]');
    if (!panel) return;
    function part(name) {
      return panel.querySelector('[data-build="' + name + '"]');
    }
    var fields = {
      repository: part('repository'), story: part('story'), time: part('time'),
      merged: part('merged'), progress: part('progress')
    };
    var rows = [];
    var found = panel.querySelectorAll('[data-stage]');
    for (var i = 0; i < found.length; i++) {
      var detail = found[i].querySelector('[data-detail]');
      rows.push({
        el: found[i],
        mark: found[i].querySelector('[data-mark]'),
        detail: detail,
        text: detail ? detail.textContent : '',  // the detail the page was built with
        cursor: found[i].querySelector('.cursor')
      });
    }
    if (!rows.length) return;

    function setText(el, text) {
      if (el && el.textContent !== text) el.textContent = text;
    }

    function show(index, step) {
      var build = builds[index];
      setText(fields.repository, String(build.repository));
      setText(fields.story, build.story + ' ' + build.title);
      setText(fields.time, String(build.time));
      setText(fields.merged, 'merged into main · pull request #' + build.pr);
      if (fields.merged) fields.merged.style.visibility = step >= 5 ? 'visible' : 'hidden';
      if (fields.progress) fields.progress.style.width = Math.min(100, step * 20) + '%';
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var done = r < step, current = r === step;
        row.el.style.color = done ? '#C3CDD9' : (current ? '#F2F2F2' : '#7186A1');
        if (row.mark) {
          setText(row.mark, done ? '✓' : (current ? '●' : '○'));
          row.mark.style.color = done ? '#05F2F2' : (current ? ACCENT : '#7186A1');
        }
        setText(row.detail, r <= step ? row.text : '');
        if (row.cursor) row.cursor.style.display = current ? 'inline-block' : 'none';
      }
    }

    var index = 0, step = 0;
    show(index, step);
    whenParsed(function () {
      setInterval(function () {
        step += 1;
        if (step > 6) {
          step = 0;
          index = (index + 1) % builds.length;
        }
        show(index, step);
      }, STEP_MS);
    });
  }

  // A part that waits until it enters the view: it is marked `waiting` (which holds it at
  // the start of its animation) until `watched` enters the view, then `started` runs the
  // design's animation once. Without the script, or without IntersectionObserver, it is
  // simply shown as it ends.
  function startWhenInView(part, watched, started) {
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        observer.disconnect();
        part.classList.remove('waiting');
        part.classList.add(started);
        return;
      }
    }, { threshold: 0 });
    part.classList.add('waiting');
    observer.observe(watched);
  }

  // The parts marked `typed` type themselves in once they enter the view, not while they
  // are still below the fold: each waits clipped until then.
  function typeWhenInView() {
    var parts = document.querySelectorAll('.typed');
    for (var i = 0; i < parts.length; i++) startWhenInView(parts[i], parts[i], 'typing');
  }

  // The line of the case study's timeline (`spine`) waits undrawn and grows from top to
  // bottom once its list enters the view. The list is watched, not the line, because the
  // undrawn line has no height.
  function growWhenInView() {
    var lines = document.querySelectorAll('.spine');
    for (var i = 0; i < lines.length; i++) startWhenInView(lines[i], lines[i].parentElement, 'growing');
  }

  if (reducedMotion()) return;
  typeWhenInView();
  growWhenInView();
  var data = readData();
  countUp(data);
  replay(data);
})();
