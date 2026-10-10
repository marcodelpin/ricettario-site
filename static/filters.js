/* Dynamic filters of the home page (SPEC R8). The server renders every recipe card with what is needed here
   (data-facets, data-type, data-search, all computed by Python) and the `hidden` attribute for the URL state; this file
   repeats that decision in the browser on every tick, keystroke and type tap, so the page also works as a static copy.
   No library, no build step. Target: Chrome 97 (ES2019): no optional chaining, no modules, no structuredClone. */
(function (root) {
  'use strict';

  var WHITESPACE = /[ \t\n\v\f\r\x1c-\x1f]+/;

  /* The search words of a text, as store.search reads them: Unicode NFKD, every non-ASCII character dropped (not only the
     combining marks), lower case, split on whitespace. */
  function normalizeQuery(text) {
    var flat = String(text).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase();
    return flat.split(WHITESPACE).filter(function (word) { return word !== ''; });
  }

  /* The text the search box holds for a query read from the URL. A search input strips CR and LF from any value it is
     given (HTML value sanitization), which would glue `pere\ncotte` into the one word `perecotte` the server never
     searched; both are word separators for the server, so they become spaces first, as app.box_text does. */
  function boxText(text) {
    return String(text).replace(/[\r\n]/g, ' ').trim();
  }

  /* Whether a card is shown. card = {facets: [keys], type: slug or '', search: text}; state = {q: text, type: slug or '',
     rows: [{keys: [chosen facet keys], exclude: bool}]}. Same semantics as facets.keeps, store.search and the type test. */
  function decide(card, state) {
    var have = {};
    card.facets.forEach(function (key) { have[key] = true; });
    for (var i = 0; i < state.rows.length; i += 1) {
      var row = state.rows[i];
      for (var j = 0; j < row.keys.length; j += 1) {
        if (row.exclude ? have[row.keys[j]] === true : have[row.keys[j]] !== true) { return false; }
      }
    }
    if (state.type && card.type !== state.type) { return false; }
    var words = normalizeQuery(state.q);
    for (var k = 0; k < words.length; k += 1) {
      if (card.search.indexOf(words[k]) === -1) { return false; }
    }
    return true;
  }

  /* ---- the page ---- */

  function init(doc, win) {
    var form = doc.querySelector('form.search');
    if (!form) { return; }
    var qName = form.getAttribute('data-search-param');
    var typeName = form.getAttribute('data-type-param');
    var input = form.querySelector('input[type=search]');
    var rowEls = Array.prototype.slice.call(form.querySelectorAll('.facet-row'));
    var boxes = Array.prototype.slice.call(form.querySelectorAll('input[type=checkbox]'));
    var countEl = doc.querySelector('p.count');
    var nav = doc.querySelector('nav.types');
    var pills = Array.prototype.map.call(nav.querySelectorAll('[data-type]'), function (el) {
      return { slug: el.getAttribute('data-type'), label: el.getAttribute('data-label'), n: Number(el.getAttribute('data-n')) };
    });
    var cards = Array.prototype.map.call(doc.querySelectorAll('a.card'), function (el) {
      var facets = (el.getAttribute('data-facets') || '').split(' ').filter(Boolean);
      return { el: el, data: { facets: facets, type: el.getAttribute('data-type') || '', search: el.getAttribute('data-search') || '' } };
    });
    var sections = Array.prototype.map.call(doc.querySelectorAll('div.cards'), function (el) {
      var head = el.previousElementSibling;
      return { cards: el, head: head && head.tagName === 'H2' ? head : null };
    });
    var total = cards.length;
    var type = '';
    var timer = null;

    Array.prototype.forEach.call(form.querySelectorAll('input[type=hidden]'), function (el) {
      el.parentNode.removeChild(el); /* the type lives in `type` now, not in a form field */
    });

    function knownType(slug) {
      return pills.some(function (pill) { return pill.slug !== '' && pill.slug === slug; });
    }

    function readState() {
      return {
        q: input.value.trim(),
        type: type,
        rows: rowEls.map(function (row) {
          return {
            name: row.getAttribute('data-row'),
            exclude: row.getAttribute('data-exclude') === '1',
            keys: Array.prototype.filter.call(row.querySelectorAll('input[type=checkbox]'), function (box) { return box.checked; })
              .map(function (box) { return box.value; })
          };
        })
      };
    }

    function active(state) {
      return state.rows.some(function (row) { return row.keys.length > 0; });
    }

    /* The query string the server parses for this state, with the same parameter names. */
    function queryOf(state, withBoxes, typeSlug) {
      var parts = [];
      function add(name, value) { parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(value).replace(/%20/g, '+')); }
      if (state.q) { add(qName, state.q); }
      if (withBoxes) {
        state.rows.forEach(function (row) { row.keys.forEach(function (key) { add(row.name, key); }); });
      }
      if (typeSlug) { add(typeName, typeSlug); }
      return parts.length ? '?' + parts.join('&') : '';
    }

    function hrefOf(state, withBoxes, typeSlug) {
      return win.location.pathname + queryOf(state, withBoxes, typeSlug);
    }

    function el(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) { node.className = className; }
      if (text !== undefined) { node.textContent = text; }
      return node;
    }

    function renderCount(state, found) {
      var filtered = state.q !== '' || active(state) || state.type !== '';
      var text;
      if (filtered) {
        text = found + ' ' + (found === 1 ? 'ricetta trovata' : 'ricette trovate') + ' su ' + total + '.';
      } else {
        text = total + ' ' + (total === 1 ? 'ricetta' : 'ricette') + '.';
      }
      countEl.textContent = text;
      if (filtered && active(state)) {
        countEl.appendChild(doc.createTextNode(' '));
        var link = el('a', '', 'Togli i filtri');
        link.href = hrefOf(state, false, state.type);
        countEl.appendChild(link);
      }
    }

    function renderEmpty(state, found) {
      var old = doc.querySelector('p.empty');
      if (old) { old.parentNode.removeChild(old); }
      if (found > 0) { return; }
      var p = el('p', 'empty');
      var filtered = state.q !== '' || active(state) || state.type !== '';
      if (!filtered) {
        p.textContent = 'Non ci sono ancora ricette.';
      } else {
        var text = 'Nessuna ricetta trovata';
        if (state.type) {
          var label = pills.filter(function (pill) { return pill.slug === state.type; })[0].label;
          text += ' in \u00ab' + label + '\u00bb';
        }
        if (state.q) { text += ' per \u00ab' + state.q + '\u00bb'; }
        if (active(state)) { text += ' con questi filtri'; }
        p.appendChild(doc.createTextNode(text + '. '));
        var link = el('a', '', 'Vedi tutte le ricette');
        link.href = win.location.pathname;
        p.appendChild(link);
        p.appendChild(doc.createTextNode('.'));
      }
      countEl.parentNode.insertBefore(p, form.nextSibling);
    }

    function renderPills(state) {
      while (nav.firstChild) { nav.removeChild(nav.firstChild); }
      pills.forEach(function (pill) {
        var current = pill.slug === state.type;
        var node;
        if (current) {
          node = el('span', 'type on');
          node.setAttribute('aria-current', 'true');
        } else if (pill.slug === '' || pill.n > 0) {
          node = el('a', 'type');
          node.href = hrefOf(state, true, pill.slug);
        } else {
          node = el('span', 'type off');
          node.setAttribute('aria-disabled', 'true');
        }
        node.setAttribute('data-type', pill.slug);
        node.appendChild(doc.createTextNode(pill.label + ' '));
        node.appendChild(el('span', 'type-n', String(pill.n)));
        nav.appendChild(node);
        nav.appendChild(doc.createTextNode('\n'));
      });
    }

    function apply() {
      var state = readState();
      var found = 0;
      cards.forEach(function (card) {
        var show = decide(card.data, state);
        card.el.hidden = !show;
        if (show) { found += 1; }
      });
      sections.forEach(function (section) {
        var any = Array.prototype.some.call(section.cards.querySelectorAll('a.card'), function (node) { return !node.hidden; });
        section.cards.hidden = !any;
        if (section.head) { section.head.hidden = !any; }
      });
      boxes.forEach(function (box) { box.parentNode.classList.toggle('on', box.checked); });
      renderCount(state, found);
      renderEmpty(state, found);
      renderPills(state);
      try {
        win.history.replaceState(null, '', win.location.pathname + queryOf(state, true, state.type));
      } catch (error) { /* a file: page may refuse; the view is right all the same */ }
    }

    /* the URL state, for a static copy that has no server to render it */
    var params = new win.URLSearchParams(win.location.search);
    input.value = boxText(params.get(qName) || '');
    boxes.forEach(function (box) { box.checked = params.getAll(box.name).indexOf(box.value) !== -1; });
    type = params.getAll(typeName).filter(knownType)[0] || '';
    apply();

    form.addEventListener('submit', function (event) { event.preventDefault(); });
    form.addEventListener('change', function (event) {
      if (event.target && event.target.type === 'checkbox') { apply(); }
    });
    input.addEventListener('input', function () {
      win.clearTimeout(timer);
      timer = win.setTimeout(apply, 150);
    });
    input.addEventListener('search', function () { win.clearTimeout(timer); apply(); });

    function plainClick(event) {
      return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    }
    function linkOf(event, container, selector) {
      var node = event.target;
      while (node && node !== container) {
        if (node.matches && node.matches(selector)) { return node; }
        node = node.parentNode;
      }
      return null;
    }
    nav.addEventListener('click', function (event) {
      var link = linkOf(event, nav, 'a.type');
      if (!link || !plainClick(event)) { return; }
      event.preventDefault();
      type = link.getAttribute('data-type');
      apply();
    });
    countEl.addEventListener('click', function (event) {
      if (!linkOf(event, countEl, 'a') || !plainClick(event)) { return; }
      event.preventDefault();
      boxes.forEach(function (box) { box.checked = false; });
      apply();
    });
    doc.addEventListener('click', function (event) {
      var empty = doc.querySelector('p.empty');
      if (!empty || !empty.contains(event.target) || !linkOf(event, empty, 'a') || !plainClick(event)) { return; }
      event.preventDefault();
      input.value = '';
      type = '';
      boxes.forEach(function (box) { box.checked = false; });
      apply();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { decide: decide, normalizeQuery: normalizeQuery, boxText: boxText };
  }
  if (typeof document !== 'undefined') {
    init(document, window);
  }
})(this);
