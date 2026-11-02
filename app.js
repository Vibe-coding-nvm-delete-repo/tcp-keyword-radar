(function () {
  'use strict';

  const M = window.TCP_META || {};
  const C = window.TCP_CONVERTED || [];
  const K = window.TCP_KEYWORDS || [];
  const S = window.TCP_SERPS || { bing: [], google: [] };
  const I = window.TCP_IDEAS || [];

  const CLUSTERS = {
    account_closed: 'Account closed',
    charge_off: 'Charge-off',
    renting: 'Renting',
    garnishment: 'Wage garnishment',
    late_payment: 'Late payment',
    collections: 'Collections',
  };
  const CLUSTER_ORDER = ['account_closed', 'charge_off', 'renting', 'garnishment', 'late_payment', 'collections'];
  const SOURCES = { g: 'Google autocomplete', b: 'Bing autocomplete', p: 'Google PAA', r: 'Google related', s: 'Seed' };
  const OVERLAP = { clear: 'Clear', possible: 'Possible', likely: 'Likely overlap', covered: 'Covered', pending: 'Review pending', new: 'New', partial: 'Partial', merge: 'Merge', overlap: 'Overlap' };

  const state = {
    view: 'overview',
    kw: { q: '', cluster: '', overlap: '', type: '', source: '', page: 1 },
    ideas: { q: '', cluster: '', verdict: '', origin: '', page: 1 },
    conv: { q: '', cluster: '' },
    serp: { engine: 'google', query: '' },
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }
  function one(n) {
    return Number(n || 0).toFixed(1);
  }
  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function clusterName(c) { return CLUSTERS[c] || c || 'Other'; }
  function badge(text, cls) { return '<span class="badge ' + esc(cls || '') + '">' + esc(text) + '</span>'; }
  function overlapBadge(v) {
    const key = v || 'pending';
    return '<span class="badge ' + esc(key) + '">' + esc(OVERLAP[key] || key) + '</span>';
  }
  function sourceChips(codes) {
    return (codes || []).map((c) => '<span class="chip">' + esc(SOURCES[c] || c) + '</span>').join(' ');
  }
  function link(url, text) {
    if (!url) return esc(text || '');
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || host(url)) + '</a>';
  }
  function pageLink(u) { return u ? link(u, u.replace(/^https?:\/\/(www\.)?/, '')) : ''; }

  function sortClusters(a, b) {
    const ia = CLUSTER_ORDER.indexOf(a), ib = CLUSTER_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  }

  // ---------- Drawer ----------
  function openDrawer(title, sub, html) {
    $('#drawer-title').textContent = title || 'Details';
    $('#drawer-sub').textContent = sub || '';
    $('#drawer-body').innerHTML = html;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#overlay').classList.add('open');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#overlay').classList.remove('open');
  }
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // ---------- Tabs ----------
  function setView(view) {
    if (!document.getElementById('view-' + view)) view = 'overview';
    state.view = view;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.go)));

  function renderCurrent() {
    if (state.view === 'keywords') renderKeywords();
    if (state.view === 'ideas') renderIdeas();
    if (state.view === 'serps') renderSerp();
  }

  // ---------- Overview ----------
  function renderStats() {
    const newIdeas = I.filter((x) => x.judge === 'new' || x.judge === 'partial').length;
    const cards = [
      { n: fmt(M.site_pages_total || 0), l: 'Live pages checked', note: (M.site_pages || 0) + ' in sitemap, all 13,105 indexed pages', go: 'method' },
      { n: fmt(M.converted_live || 0), l: 'Converted pages live', note: '24 known, 1 is a 404', go: 'converted' },
      { n: fmt(M.keywords || 0), l: 'Keywords harvested', note: (M.questions || 0) + ' are questions', go: 'keywords' },
      { n: fmt(newIdeas), l: 'New page ideas', note: 'judged new or partial', go: 'ideas' },
    ];
    $('#stat-grid').innerHTML = cards.map((c) => (
      '<div class="card stat" role="button" tabindex="0" data-go="' + c.go + '" style="cursor:pointer">' +
        '<div class="num">' + esc(c.n) + '</div>' +
        '<div class="lbl">' + esc(c.l) + '</div>' +
        '<div class="note">' + esc(c.note) + '</div>' +
      '</div>'
    )).join('');
    $$('#stat-grid [data-go]').forEach((el) => {
      el.addEventListener('click', () => setView(el.dataset.go));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') setView(el.dataset.go); });
    });
  }

  function verdictRank(v) {
    return { new: 0, partial: 1, pending: 2, merge: 3, overlap: 4 }[v] ?? 2;
  }

  function renderTopOpportunities() {
    const list = I.slice()
      .filter((x) => x.judge === 'new' || x.judge === 'partial')
      .sort((a, b) => (b.judge === 'new' ? 1 : 0) - (a.judge === 'new' ? 1 : 0) || (b.score - a.score) || (b.demand - a.demand))
      .slice(0, 8);
    if (!list.length) {
      $('#top-opportunities').innerHTML = '<div class="empty">The semantic review is still running. Page ideas with a final verdict will appear here.</div>';
      return;
    }
    $('#top-opportunities').innerHTML = list.map((x) => (
      '<div class="idea-card" style="padding:10px 0;box-shadow:none">' +
        '<div class="row between" style="align-items:flex-start">' +
          '<div><h4 style="margin:0 0 3px">' + esc(x.title) + '</h4>' +
          '<div class="small muted">' + esc(clusterName(x.cluster)) + ' · ' + esc(x.primary) + '</div></div>' +
          '<div>' + overlapBadge(x.judge) + '</div>' +
        '</div>' +
        '<div class="row small muted" style="margin-top:6px">' +
          '<span>' + fmt(x.kw_count) + ' supporting keywords</span><span>·</span>' +
          '<span>priority ' + esc(x.priority) + '</span><span>·</span>' +
          '<span>demand ' + one(x.demand) + '</span>' +
        '</div>' +
      '</div>'
    )).join('');
    $$('#top-opportunities .idea-card').forEach((el, i) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => { setView('ideas'); openIdeaDrawer(list[i]); });
    });
  }

  function renderCoverage() {
    const cov = M.coverage || {};
    const max = Math.max(1, ...Object.values(cov));
    $('#coverage-chart').innerHTML = CLUSTER_ORDER.map((c) => (
      '<div style="margin-bottom:12px">' +
        '<div class="row between small" style="margin-bottom:4px"><strong>' + esc(clusterName(c)) + '</strong><span class="muted">' + fmt(cov[c] || 0) + ' live pages</span></div>' +
        '<div class="bar"><span style="width:' + Math.max(3, Math.round((cov[c] || 0) / max * 100)) + '%"></span></div>' +
      '</div>'
    )).join('');
  }

  function renderSources() {
    $('#source-list').innerHTML = (M.sources || []).map((s) => (
      '<div class="row between" style="padding:8px 0">' +
        '<div><strong class="small">' + esc(s.name) + '</strong><div class="small muted">' + esc(s.detail) + '</div></div>' +
        '<div class="mono small">' + fmt(s.count) + '</div>' +
      '</div>'
    )).join('');
  }

  function renderLimits() {
    $('#limit-list').innerHTML = (M.limits || []).map((x) => '<li>' + esc(x) + '</li>').join('');
    $('#method-limits').innerHTML = (M.limits || []).map((x) => '<li>' + esc(x) + '</li>').join('');
  }

  // ---------- Converted ----------
  function fillClusterSelect(sel) {
    if (!sel) return;
    sel.innerHTML = '<option value="">All clusters</option>' + CLUSTER_ORDER.map((c) => '<option value="' + c + '">' + esc(clusterName(c)) + '</option>').join('');
  }

  function convertedFiltered() {
    const q = state.conv.q.trim().toLowerCase();
    return C.filter((c) => {
      if (state.conv.cluster && c.cluster !== state.conv.cluster) return false;
      if (!q) return true;
      return (c.title + ' ' + c.seed + ' ' + c.core_intent + ' ' + (c.seed_queries || []).join(' ')).toLowerCase().includes(q);
    }).sort((a, b) => sortClusters(a.cluster, b.cluster) || (b.words - a.words));
  }

  function renderConverted() {
    const list = convertedFiltered();
    $('#conv-count').textContent = list.length + ' pages';
    $('#converted-grid').innerHTML = list.map((c) => {
      const details = [
        c.core_intent ? '<p style="margin:10px 0 0"><strong>Core intent.</strong> ' + esc(c.core_intent) + '</p>' : '',
        (c.covers && c.covers.length) ? '<details style="margin-top:10px"><summary class="small" style="cursor:pointer"><strong>Covers</strong></summary><ul class="list small muted">' + c.covers.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '',
        (c.does_not_cover && c.does_not_cover.length) ? '<details style="margin-top:8px"><summary class="small" style="cursor:pointer"><strong>Does not cover</strong></summary><ul class="list small muted">' + c.does_not_cover.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '',
        (c.seed_queries && c.seed_queries.length) ? '<details style="margin-top:8px"><summary class="small" style="cursor:pointer"><strong>Seed queries</strong></summary><div style="margin-top:6px">' + c.seed_queries.map((x) => '<span class="chip" style="margin:2px 4px 2px 0">' + esc(x) + '</span>').join('') + '</div></details>' : '',
      ].join('');
      return '<div class="card">' +
        '<div class="row between" style="align-items:flex-start;gap:8px">' +
          '<div><h3 style="margin-bottom:4px">' + esc(c.title || c.seed) + '</h3>' +
          '<div class="small">' + pageLink(c.url) + '</div></div>' +
          '<div>' + (c.live ? badge(clusterName(c.cluster), 'possible') : badge('404', 'covered')) + '</div>' +
        '</div>' +
        '<div class="row small muted" style="margin-top:8px">' +
          '<span>' + fmt(c.words) + ' words</span><span>·</span><span>' + esc(c.seed) + '</span>' +
        '</div>' + details +
      '</div>';
    }).join('') || '<div class="empty">No converted pages match that filter.</div>';
  }

  // ---------- Keywords ----------
  let kwFiltered = [];
  const KW_PAGE = 50;

  function keywordFiltered() {
    const q = state.kw.q.trim().toLowerCase();
    const src = state.kw.source;
    const out = [];
    for (const k of K) {
      if (state.kw.cluster && k.c !== state.kw.cluster) continue;
      if (state.kw.overlap && k.ov !== state.kw.overlap) continue;
      if (state.kw.type === 'q' && !k.q) continue;
      if (state.kw.type === 't' && k.q) continue;
      if (src && !(k.src || []).includes(src)) continue;
      if (q && !k.k.includes(q)) continue;
      out.push(k);
    }
    out.sort((a, b) => (b.d - a.d) || a.k.localeCompare(b.k));
    return out;
  }

  function renderKeywords() {
    kwFiltered = keywordFiltered();
    const pages = Math.max(1, Math.ceil(kwFiltered.length / KW_PAGE));
    if (state.kw.page > pages) state.kw.page = pages;
    const start = (state.kw.page - 1) * KW_PAGE;
    const slice = kwFiltered.slice(start, start + KW_PAGE);
    $('#kw-count').textContent = fmt(kwFiltered.length) + ' keywords';
    $('#kw-body').innerHTML = slice.map((k, i) => {
      const m = k.m && k.m[0];
      const sp = k.sp && k.sp[0];
      return '<tr class="rowlink" data-idx="' + (start + i) + '">' +
        '<td class="kw">' + esc(k.k) + '<span class="tiny">' + (k.q ? 'Question' : 'Topic') + '</span></td>' +
        '<td>' + esc(clusterName(k.c)) + '</td>' +
        '<td class="mono">' + one(k.d) + '</td>' +
        '<td>' + (k.q ? badge('Question', 'possible') : badge('Topic', '')) + '</td>' +
        '<td class="small">' + sourceChips(k.src) + '</td>' +
        '<td class="url">' + (m ? link(m.u, m.t) : '<span class="muted">None</span>') + '</td>' +
        '<td>' + overlapBadge(k.ov) + '</td>' +
        '<td class="url">' + (sp ? link(sp.u, sp.t) : '<span class="muted">No SERP</span>') + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="8"><div class="empty">No keywords match those filters.</div></td></tr>';
    $('#kw-pager').innerHTML = '<button ' + (state.kw.page <= 1 ? 'disabled' : '') + ' data-page="' + (state.kw.page - 1) + '">Previous</button>' +
      '<span class="page">Page ' + state.kw.page + ' of ' + pages + '</span>' +
      '<button ' + (state.kw.page >= pages ? 'disabled' : '') + ' data-page="' + (state.kw.page + 1) + '">Next</button>';
    $$('#kw-pager button').forEach((b) => b.addEventListener('click', () => { state.kw.page = Number(b.dataset.page); renderKeywords(); }));
    $$('#kw-body tr[data-idx]').forEach((tr) => tr.addEventListener('click', () => openKeywordDrawer(kwFiltered[Number(tr.dataset.idx)])));
  }

  function openKeywordDrawer(k) {
    if (!k) return;
    const matches = (k.m || []).map((m) => '<li>' + link(m.u, m.t) + ' <span class="small muted">match ' + m.s + '</span></li>').join('');
    const sp = (k.sp || []).map((x, i) => '<li><span class="mono small">#' + (i + 1) + '</span> ' + link(x.u, x.t) + ' <span class="small muted">' + esc(x.d) + '</span></li>').join('');
    const seeds = (k.seeds || []).map((s) => '<span class="chip">' + esc(s) + '</span>').join(' ');
    const html = '' +
      '<div class="row" style="margin-bottom:12px">' + overlapBadge(k.ov) + '<span class="chip">' + esc(clusterName(k.c)) + '</span><span class="chip">' + (k.q ? 'Question' : 'Topic') + '</span></div>' +
      '<dl class="kv">' +
        '<dt>Demand score</dt><dd class="mono">' + one(k.d) + '</dd>' +
        '<dt>Sources</dt><dd>' + sourceChips(k.src) + '</dd>' +
        '<dt>Seed terms</dt><dd>' + (seeds || '<span class="muted">None</span>') + '</dd>' +
        '<dt>SERP query</dt><dd>' + esc(k.sq || 'No direct SERP') + (k.se ? ' <span class="badge ' + (k.se === 'google' ? 'clear' : 'possible') + '">' + esc(k.se) + '</span>' : '') + '</dd>' +
      '</dl>' +
      '<h4 style="margin-top:18px">Closest live pages</h4>' +
      (matches ? '<ul class="list">' + matches + '</ul>' : '<p class="muted small">No close page found. This is a candidate gap.</p>') +
      '<h4 style="margin-top:18px">Top relevant results for the SERP query</h4>' +
      (sp ? '<ul class="list">' + sp + '</ul>' : '<p class="muted small">No top-10 data for this keyword. Bing coverage is per seed, not per keyword.</p>') +
      '<div class="callout neutral" style="margin-top:18px"><div class="kicker">How to read this</div><p class="small">Overlap is a lexical prefilter here. The page-idea tab carries the semantic verdict. A "clear" keyword can still belong to a page idea that is already covered.</p></div>';
    openDrawer(k.k, clusterName(k.c) + ' · demand ' + one(k.d), html);
  }

  // ---------- SERP ----------
  function serpQueries() {
    if (state.serp.engine === 'google') return S.google.map((x) => x.k);
    return S.bing.map((x) => x.q);
  }
  function currentSerp() {
    if (state.serp.engine === 'google') return S.google.find((x) => x.k === state.serp.query) || S.google[0];
    return S.bing.find((x) => x.q === state.serp.query) || S.bing[0];
  }
  function renderSerpSelect() {
    const queries = serpQueries();
    if (!state.serp.query || !queries.includes(state.serp.query)) {
      state.serp.query = queries[0] || '';
    }
    $('#serp-query').innerHTML = queries.map((q) => '<option value="' + esc(q) + '"' + (q === state.serp.query ? ' selected' : '') + '>' + esc(q) + '</option>').join('');
    $('#serp-count').textContent = fmt(queries.length) + ' queries';
  }
  function renderSerp() {
    renderSerpSelect();
    const rec = currentSerp();
    if (!rec) { $('#serp-content').innerHTML = '<div class="empty">No SERP data.</div>'; return; }
    const organic = rec.organic || rec.r || [];
    const questions = rec.questions || [];
    const related = rec.related || [];
    const ai = rec.ai || '';
    const results = organic.map((r, i) => (
      '<div class="card tight" style="padding:14px 16px">' +
        '<div class="row between" style="align-items:flex-start;gap:8px">' +
          '<div style="min-width:0">' +
            '<div class="row" style="gap:8px;margin-bottom:4px"><span class="mono small muted">#' + (r.rank || i + 1) + '</span><span class="chip">' + esc(r.d || r.domain || host(r.u || r.url)) + '</span></div>' +
            '<div style="font-weight:600">' + link(r.u || r.url, r.t || r.title) + '</div>' +
            '<div class="small muted" style="margin-top:4px">' + esc(r.s || r.snippet || '') + '</div>' +
          '</div>' +
          (host(r.u || r.url) === 'thecreditpeople.com' ? badge('You', 'clear') : '') +
        '</div>' +
      '</div>'
    )).join('') || '<div class="empty">No organic results saved for this query.</div>';

    const paa = questions.length ? '<div class="card"><h3>People Also Ask</h3><div class="small muted" style="margin-bottom:10px">' + questions.length + ' questions from Google, click depth 4. Open questions are real queries, not generated.</div><ol class="list">' + questions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ol></div>' : '';
    const rel = related.length ? '<div class="card"><h3>Related searches</h3><div>' + related.map((q) => '<span class="chip" style="margin:3px 5px 3px 0">' + esc(q) + '</span>').join('') + '</div></div>' : '';
    const aiBox = ai ? '<div class="card"><h3>AI Overview text</h3><p class="small muted">' + esc(ai) + '</p></div>' : '';
    const existing = '<div class="card"><h3>Top 10</h3><div class="small muted" style="margin-bottom:10px">' + (state.serp.engine === 'google' ? 'Google' : 'Bing') + ' results, fetched November 2, 2026. The Credit People pages are marked.</div>' + results + '</div>';
    $('#serp-content').innerHTML = '<div class="grid grid-2" style="align-items:start"><div>' + existing + '</div><div>' + paa + rel + aiBox + '</div></div>';
  }

  // ---------- Ideas ----------
  let ideasFiltered = [];
  const IDEA_PAGE = 40;

  function ideaFiltered() {
    const q = state.ideas.q.trim().toLowerCase();
    const out = I.filter((x) => {
      if (state.ideas.cluster && x.cluster !== state.ideas.cluster) return false;
      if (state.ideas.verdict && x.judge !== state.ideas.verdict) return false;
      if (state.ideas.origin && x.origin !== state.ideas.origin) return false;
      if (!q) return true;
      return (x.title + ' ' + x.slug + ' ' + x.primary + ' ' + (x.supp || []).join(' ')).toLowerCase().includes(q);
    });
    out.sort((a, b) => verdictRank(a.judge) - verdictRank(b.judge) || (b.score - a.score) || (b.demand - a.demand));
    return out;
  }

  function renderIdeas() {
    ideasFiltered = ideaFiltered();
    const pages = Math.max(1, Math.ceil(ideasFiltered.length / IDEA_PAGE));
    if (state.ideas.page > pages) state.ideas.page = pages;
    const start = (state.ideas.page - 1) * IDEA_PAGE;
    const slice = ideasFiltered.slice(start, start + IDEA_PAGE);
    $('#idea-count').textContent = fmt(ideasFiltered.length) + ' ideas';
    $('#idea-body').innerHTML = slice.map((x, i) => {
      const closest = x.closest && x.closest[0];
      return '<tr class="rowlink" data-idx="' + (start + i) + '">' +
        '<td class="kw">' + esc(x.title) + '<span class="tiny">' + esc(x.slug) + '</span></td>' +
        '<td>' + esc(clusterName(x.cluster)) + '</td>' +
        '<td class="url">' + esc(x.primary) + '</td>' +
        '<td class="mono small">' + fmt(x.kw_count) + ' kw<span class="tiny">score ' + one(x.score) + ' · demand ' + one(x.demand) + '</span></td>' +
        '<td class="url">' + (closest ? link(closest.u, closest.t) : '<span class="muted">None</span>') + '</td>' +
        '<td>' + overlapBadge(x.judge) + '</td>' +
        '<td class="mono">' + esc(x.priority) + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty">No page ideas match those filters.</div></td></tr>';
    $('#idea-pager').innerHTML = '<button ' + (state.ideas.page <= 1 ? 'disabled' : '') + ' data-page="' + (state.ideas.page - 1) + '">Previous</button>' +
      '<span class="page">Page ' + state.ideas.page + ' of ' + pages + '</span>' +
      '<button ' + (state.ideas.page >= pages ? 'disabled' : '') + ' data-page="' + (state.ideas.page + 1) + '">Next</button>';
    $$('#idea-pager button').forEach((b) => b.addEventListener('click', () => { state.ideas.page = Number(b.dataset.page); renderIdeas(); }));
    $$('#idea-body tr[data-idx]').forEach((tr) => tr.addEventListener('click', () => openIdeaDrawer(ideasFiltered[Number(tr.dataset.idx)])));
  }

  function openIdeaDrawer(x) {
    if (!x) return;
    const supp = (x.supp || []).map((s) => '<span class="chip" style="margin:3px 4px 3px 0">' + esc(s) + '</span>').join('');
    const closest = (x.closest || []).map((m) => '<li>' + link(m.u, m.t) + ' <span class="small muted">' + (m.s != null ? 'match ' + m.s : '') + '</span></li>').join('');
    const html = '' +
      '<div class="row" style="margin-bottom:12px">' + overlapBadge(x.judge) + '<span class="chip">' + esc(clusterName(x.cluster)) + '</span><span class="chip">' + esc(x.origin) + '</span><span class="chip">priority ' + esc(x.priority) + '</span></div>' +
      (x.judge_reason ? '<div class="callout ' + (x.judge === 'new' ? '' : 'neutral') + '"><div class="kicker">Semantic verdict</div><p class="small">' + esc(x.judge_reason) + '</p>' + (x.judge_url ? '<p class="small">Closest page: ' + link(x.judge_url, x.judge_url) + '</p>' : '') + '</div>' : '<div class="callout neutral"><div class="kicker">Semantic verdict</div><p class="small">Review pending. The lexical match is ' + esc(x.site_ov || 'unknown') + '.</p></div>') +
      '<dl class="kv">' +
        '<dt>Slug</dt><dd><code>' + esc(x.slug) + '</code></dd>' +
        '<dt>Primary keyword</dt><dd>' + esc(x.primary) + '</dd>' +
        '<dt>Support</dt><dd>' + fmt(x.kw_count) + ' harvested keywords · demand ' + one(x.demand) + ' · score ' + one(x.score) + '</dd>' +
        '<dt>Evidence</dt><dd>' + esc(x.strength || 'n/a') + '</dd>' +
      '</dl>' +
      (x.intent ? '<h4 style="margin-top:18px">Reader intent</h4><p class="small">' + esc(x.intent) + '</p>' : '') +
      (x.why ? '<h4 style="margin-top:14px">Why it is distinct</h4><p class="small">' + esc(x.why) + '</p>' : '') +
      (x.sharpened ? '<h4 style="margin-top:14px">Sharper title</h4><p class="small">' + esc(x.sharpened) + '</p>' : '') +
      '<h4 style="margin-top:18px">Supporting keywords</h4><div>' + (supp || '<span class="muted small">None</span>') + '</div>' +
      '<h4 style="margin-top:18px">Closest live pages</h4>' + (closest ? '<ul class="list">' + closest + '</ul>' : '<p class="small muted">No close page.</p>') +
      '<div class="row" style="margin-top:20px"><button class="btn btn-ghost" id="copy-brief">Copy page brief</button></div>';
    openDrawer(x.title, x.slug, html);
    $('#copy-brief').addEventListener('click', () => {
      const text = [x.title, x.slug, 'Cluster: ' + clusterName(x.cluster), 'Primary: ' + x.primary, 'Intent: ' + x.intent, 'Why: ' + x.why, 'Keywords: ' + (x.supp || []).join(', '), 'Verdict: ' + x.judge, 'Reason: ' + x.judge_reason].join('\n');
      copyText(text);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Copied')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed'); }
    document.body.removeChild(ta);
  }
  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0e2732;color:#fff;padding:9px 16px;border-radius:8px;font-size:13px;z-index:90;box-shadow:0 8px 24px rgba(0,0,0,.2)'; document.body.appendChild(el); }
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 1600);
  }

  function exportIdeas() {
    const rows = ideasFiltered.length ? ideasFiltered : ideaFiltered();
    const header = ['title', 'slug', 'cluster', 'primary_keyword', 'supporting_keywords', 'kw_count', 'demand', 'verdict', 'priority', 'closest_page', 'reason'];
    const lines = [header.join(',')];
    for (const x of rows) {
      const vals = [x.title, x.slug, clusterName(x.cluster), x.primary, (x.supp || []).join(' | '), x.kw_count, x.demand, x.judge, x.priority, (x.closest && x.closest[0] ? x.closest[0].u : ''), x.judge_reason];
      lines.push(vals.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tcp-page-ideas-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Method ----------
  function renderMethod() {
    const rows = [
      ['Sitemap URLs', fmt(M.site_pages || 0)],
      ['Live pages with metadata', fmt(M.site_pages_total || 0)],
      ['Converted pages reviewed', fmt(M.converted || 0)],
      ['Keywords', fmt(M.keywords || 0)],
      ['Questions', fmt(M.questions || 0)],
      ['Google PAA questions', fmt(M.paa_questions || 0)],
      ['Google related searches', fmt(M.related_searches || 0)],
      ['Google SERP queries', fmt(M.google_queries || 0)],
      ['Bing SERP queries', fmt(M.bing_queries || 0)],
      ['Page ideas screened', fmt(M.ideas || 0)],
    ];
    $('#inventory').innerHTML = '<div class="grid grid-3">' + rows.map((r) => '<div class="card tight"><div class="small muted">' + esc(r[0]) + '</div><div class="mono" style="font-size:20px">' + esc(r[1]) + '</div></div>').join('') + '</div>';
  }

  // ---------- Filters ----------
  function bindFilters() {
    const kwSearch = $('#kw-search');
    let t1;
    kwSearch.addEventListener('input', () => { clearTimeout(t1); t1 = setTimeout(() => { state.kw.q = kwSearch.value; state.kw.page = 1; renderKeywords(); }, 140); });
    $('#kw-cluster').addEventListener('change', (e) => { state.kw.cluster = e.target.value; state.kw.page = 1; renderKeywords(); });
    $('#kw-overlap').addEventListener('change', (e) => { state.kw.overlap = e.target.value; state.kw.page = 1; renderKeywords(); });
    $('#kw-type').addEventListener('change', (e) => { state.kw.type = e.target.value; state.kw.page = 1; renderKeywords(); });
    $('#kw-source').addEventListener('change', (e) => { state.kw.source = e.target.value; state.kw.page = 1; renderKeywords(); });

    const ideaSearch = $('#idea-search');
    let t2;
    ideaSearch.addEventListener('input', () => { clearTimeout(t2); t2 = setTimeout(() => { state.ideas.q = ideaSearch.value; state.ideas.page = 1; renderIdeas(); }, 140); });
    $('#idea-cluster').addEventListener('change', (e) => { state.ideas.cluster = e.target.value; state.ideas.page = 1; renderIdeas(); });
    $('#idea-verdict').addEventListener('change', (e) => { state.ideas.verdict = e.target.value; state.ideas.page = 1; renderIdeas(); });
    $('#idea-origin').addEventListener('change', (e) => { state.ideas.origin = e.target.value; state.ideas.page = 1; renderIdeas(); });
    $('#idea-export').addEventListener('click', exportIdeas);
    $('#idea-clear').addEventListener('click', () => {
      state.ideas.verdict = state.ideas.verdict === 'new' ? '' : 'new';
      $('#idea-verdict').value = state.ideas.verdict;
      state.ideas.page = 1;
      renderIdeas();
    });

    $('#conv-search').addEventListener('input', (e) => { state.conv.q = e.target.value; renderConverted(); });
    $('#conv-cluster').addEventListener('change', (e) => { state.conv.cluster = e.target.value; renderConverted(); });

    $('#serp-engine').addEventListener('change', (e) => { state.serp.engine = e.target.value; state.serp.query = ''; renderSerp(); });
    $('#serp-query').addEventListener('change', (e) => { state.serp.query = e.target.value; renderSerp(); });
  }

  // ---------- Init ----------
  function init() {
    fillClusterSelect($('#kw-cluster'));
    fillClusterSelect($('#idea-cluster'));
    fillClusterSelect($('#conv-cluster'));
    renderStats();
    renderTopOpportunities();
    renderCoverage();
    renderSources();
    renderLimits();
    renderConverted();
    renderMethod();
    bindFilters();
    renderSerp();
    const hash = (location.hash || '').replace('#', '');
    setView(document.getElementById('view-' + hash) ? hash : 'overview');
    const loading = $('#loading');
    if (loading) loading.style.display = 'none';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
