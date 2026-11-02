(function () {
  'use strict';
  const M = window.TCP2_META || {};
  const S = window.TCP2_SEEDS || [];
  const C = window.TCP2_CONVERTED || [];
  let K = window.TCP2_KEYWORDS || null;
  let I = window.TCP2_IDEAS || null;

  const CLUSTERS = { auto: 'Auto', mortgage: 'Mortgage', credit: 'Credit', company: 'Company', state: 'State', business: 'Business', docs: 'Documents', life: 'Life event', renting: 'Renting' };
  const SUBS = {
    car_model: 'Car model', program: 'Loan program', score_band: 'Score band', score_program: 'Score + program', waiting_period: 'Waiting period',
    income: 'Income type', property: 'Property type', process: 'Process', lender: 'Lender', loss_mitigation: 'Loss mitigation', report_item: 'Report item',
    action: 'Credit action', bank: 'Bank', card: 'Card', collection: 'Collector', bureau: 'Bureau', student_loan: 'Student loan', business_credit: 'Business credit',
    document: 'Document', event: 'Life event', finance: 'Auto finance',
  };
  const OVERLAP = { clear: 'Clear', possible: 'Possible', likely: 'Likely', covered: 'Covered', pending: 'Pending', new: 'New', partial: 'Partial', merge: 'Merge', overlap: 'Overlap' };

  const state = {
    view: 'overview',
    seeds: { q: '', cluster: '', sub: '', priority: '', overlap: '', page: 1 },
    kw: { q: '', cluster: '', overlap: '', type: '', page: 1 },
    ideas: { q: '', cluster: '', verdict: '', page: 1 },
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const one = (n) => Number(n || 0).toFixed(1);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const cname = (c) => CLUSTERS[c] || c;
  const sname = (s) => SUBS[s] || s;
  const badge = (t, c) => '<span class="badge ' + esc(c || '') + '">' + esc(t) + '</span>';
  const ovBadge = (v) => '<span class="badge ' + esc(v || 'pending') + '">' + esc(OVERLAP[v || 'pending'] || v) + '</span>';
  const link = (u, t) => u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t || host(u)) + '</a>' : esc(t || '');
  const pageLink = (u) => u ? link(u, u.replace(/^https?:\/\/(www\.)?/, '')) : '';

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

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  let kwPromise, ideaPromise;
  function ensureKeywords() {
    if (K) return Promise.resolve(K);
    if (!kwPromise) kwPromise = loadScript('data/keywords.js').then(() => { K = window.TCP2_KEYWORDS || []; return K; });
    return kwPromise;
  }
  function ensureIdeas() {
    if (I) return Promise.resolve(I);
    if (!ideaPromise) ideaPromise = loadScript('data/ideas.js').then(() => { I = window.TCP2_IDEAS || []; return I; });
    return ideaPromise;
  }

  function setView(v) {
    if (!document.getElementById('view-' + v)) v = 'overview';
    state.view = v;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach((x) => x.classList.toggle('active', x.id === 'view-' + v));
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    if (v === 'keywords') ensureKeywords().then(renderKeywords).catch(() => {});
    if (v === 'ideas') ensureIdeas().then(renderIdeas).catch(() => {});
    if (v === 'seeds') renderSeeds();
    if (v === 'converted') renderConverted();
    if (v === 'overview') renderTop();
    window.scrollTo({ top: 0 });
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.go)));

  function renderStats() {
    const cards = [
      { n: fmt(M.seeds), l: 'Seeds mined', note: (M.with_autocomplete || 0) + ' with autocomplete', go: 'seeds' },
      { n: fmt(M.with_serp), l: 'Seeds with a relevant top 10', note: 'Bing, US market, filtered for relevance', go: 'seeds' },
      { n: fmt(M.keywords), l: 'Keywords', note: 'autocomplete and seed terms', go: 'keywords' },
      { n: fmt(M.ready || 0), l: 'Ready page ideas', note: 'judged new or partial, after dedupe', go: 'ideas' },
    ];
    $('#stat-grid').innerHTML = cards.map((c) => '<div class="card stat" data-go="' + c.go + '" role="button" tabindex="0" style="cursor:pointer"><div class="num">' + esc(c.n) + '</div><div class="lbl">' + esc(c.l) + '</div><div class="note">' + esc(c.note) + '</div></div>').join('');
    $$('#stat-grid [data-go]').forEach((el) => { el.addEventListener('click', () => setView(el.dataset.go)); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') setView(el.dataset.go); }); });
  }

  function renderTop() {
    if (!I) {
      $('#top-opportunities').innerHTML = '<div class="empty">Loading page-idea verdicts…</div>';
      ensureIdeas().then(renderTop).catch(() => { $('#top-opportunities').innerHTML = '<div class="empty">Page ideas failed to load.</div>'; });
      return;
    }
    const rank = { new: 0, partial: 1, pending: 2, merge: 3, overlap: 4 };
    const list = I.filter((x) => x.judge === 'new' || x.judge === 'partial')
      .sort((a, b) => rank[a.judge] - rank[b.judge] || ((b.d + b.n * 3) - (a.d + a.n * 3)) || (b.pri - a.pri)).slice(0, 8);
    if (!list.length) { $('#top-opportunities').innerHTML = '<div class="empty">No final verdicts yet.</div>'; return; }
    $('#top-opportunities').innerHTML = list.map((x, i) => '<div class="idea-card" data-i="' + i + '" style="padding:10px 0;box-shadow:none;cursor:pointer"><div class="row between" style="align-items:flex-start"><div><h4 style="margin:0 0 3px">' + esc(x.title) + '</h4><div class="small muted">' + esc(cname(x.c)) + ' · ' + esc(x.primary) + '</div></div><div>' + ovBadge(x.judge) + '</div></div><div class="row small muted" style="margin-top:6px"><span>' + fmt(x.n) + ' keywords</span><span>·</span><span>demand ' + one(x.d) + '</span><span>·</span><span>' + esc(sname(x.sub)) + '</span></div></div>').join('');
    $$('#top-opportunities .idea-card').forEach((el) => el.addEventListener('click', () => { setView('ideas'); openIdea(list[Number(el.dataset.i)]); }));
  }

  function renderClusters() {
    const c = M.clusters || {};
    const max = Math.max(1, ...Object.values(c));
    $('#cluster-chart').innerHTML = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<div style="margin-bottom:12px"><div class="row between small" style="margin-bottom:4px"><strong>' + esc(cname(k)) + '</strong><span class="muted">' + fmt(v) + ' seeds</span></div><div class="bar"><span style="width:' + Math.max(3, Math.round(v / max * 100)) + '%"></span></div></div>').join('');
  }

  function renderSources() {
    $('#source-list').innerHTML = (M.sources || []).map((s) => '<div class="row between" style="padding:8px 0"><div><strong class="small">' + esc(s.name) + '</strong><div class="small muted">' + esc(s.detail) + '</div></div><div class="mono small">' + fmt(s.count) + '</div></div>').join('');
  }
  function renderLimits() {
    $('#limit-list').innerHTML = (M.limits || []).map((x) => '<li>' + esc(x) + '</li>').join('');
    $('#method-limits').innerHTML = (M.limits || []).map((x) => '<li>' + esc(x) + '</li>').join('');
  }

  function fill(sel, obj, all) {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = '<option value="">' + all + '</option>' + Object.keys(obj).sort().map((k) => '<option value="' + esc(k) + '">' + esc(SUBS[k] || CLUSTERS[k] || k) + '</option>').join('');
  }

  // ---------- Converted ----------
  function renderConverted() {
    $('#conv-body').innerHTML = C.map((c, i) => {
      const top = c.g && c.g[0];
      return '<tr class="rowlink" data-c="' + i + '"><td class="kw">' + esc(c.title || c.seed) + '<span class="tiny">' + esc(c.url.replace(/^https?:\/\/(www\.)?/, '')) + '</span></td><td>' + esc(cname(c.cluster)) + '</td><td class="small">' + esc(c.seed) + '</td><td class="mono small">' + fmt(c.kw_count) + '</td><td class="url">' + (top ? link(top.u, top.t) + '<span class="tiny">' + esc(c.engine || '') + '</span>' : '<span class="muted">No relevant result</span>') + '</td><td class="mono small">' + fmt((c.paa || []).length) + '</td><td class="mono small">' + fmt(c.words) + '</td></tr>';
    }).join('');
    $$('#conv-body tr[data-c]').forEach((tr) => tr.addEventListener('click', () => openConverted(C[Number(tr.dataset.c)])));
  }
  function openConverted(c) {
    const top = (c.g || []).map((x, i) => '<li><span class="mono small">#' + (x.r || i + 1) + '</span> ' + link(x.u, x.t) + ' <span class="small muted">' + esc(x.d) + '</span><div class="small muted">' + esc(x.sn || '') + '</div></li>').join('');
    const paa = (c.paa || []).map((x) => '<li>' + esc(x) + '</li>').join('');
    const html = '<div class="row" style="margin-bottom:12px"><span class="chip">' + esc(cname(c.cluster)) + '</span><span class="chip">' + fmt(c.words) + ' words</span></div>' +
      (c.core_intent ? '<div class="callout"><div class="kicker">Core intent</div><p class="small">' + esc(c.core_intent) + '</p></div>' : '') +
      '<dl class="kv"><dt>Seed</dt><dd>' + esc(c.seed) + '</dd><dt>SERP engine</dt><dd>' + esc(c.engine || 'none') + '</dd><dt>Keywords</dt><dd>' + fmt(c.kw_count) + ' · demand ' + one(c.demand) + '</dd></dl>' +
      '<h4 style="margin-top:18px">Top 10 results</h4>' + (top ? '<ul class="list">' + top + '</ul>' : '<p class="small muted">No Bing results saved.</p>') +
      (paa ? '<h4 style="margin-top:18px">People Also Ask</h4><ul class="list">' + paa + '</ul>' : '');
    openDrawer(c.title || c.seed, c.url.replace(/^https?:\/\/(www\.)?/, ''), html);
  }

  // ---------- Seeds ----------
  let seedFiltered = [];
  const SEED_PAGE = 50;
  function seedFilteredList() {
    const q = state.seeds.q.trim().toLowerCase();
    const out = [];
    for (const s of S) {
      if (state.seeds.cluster && s.c !== state.seeds.cluster) continue;
      if (state.seeds.sub && s.sub !== state.seeds.sub) continue;
      if (state.seeds.priority && String(s.p) !== state.seeds.priority) continue;
      if (state.seeds.overlap && s.ov !== state.seeds.overlap) continue;
      if (q && !s.s.includes(q)) continue;
      out.push(s);
    }
    out.sort((a, b) => (b.d - a.d) || (b.n - a.n) || a.s.localeCompare(b.s));
    return out;
  }
  function renderSeeds() {
    seedFiltered = seedFilteredList();
    const pages = Math.max(1, Math.ceil(seedFiltered.length / SEED_PAGE));
    if (state.seeds.page > pages) state.seeds.page = pages;
    const start = (state.seeds.page - 1) * SEED_PAGE;
    const slice = seedFiltered.slice(start, start + SEED_PAGE);
    $('#seed-count').textContent = fmt(seedFiltered.length) + ' seeds';
    $('#seed-body').innerHTML = slice.map((s, i) => {
      const top = s.g && s.g[0];
      const m = s.m && s.m[0];
      const idea = s.idea;
      return '<tr class="rowlink" data-i="' + (start + i) + '">' +
        '<td class="kw">' + esc(s.s) + '<span class="tiny">' + esc(sname(s.sub)) + ' · P' + esc(s.p) + ' · ' + fmt(s.n) + ' kw</span></td>' +
        '<td class="url">' + (top ? link(top.u, top.t) + '<span class="tiny">' + esc(top.d) + '</span>' : '<span class="muted">No relevant result</span><span class="tiny">' + fmt(s.raw || 0) + ' raw Bing results</span>') + '</td>' +
        '<td class="url">' + (m ? link(m.u, m.t) : '<span class="muted">None</span>') + '</td>' +
        '<td>' + ovBadge(s.ov) + '</td>' +
        '<td class="url">' + (idea ? esc(idea.title) + '<span class="tiny">' + ovBadge(idea.verdict) + '</span>' : '<span class="muted">No idea</span>') + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="5"><div class="empty">No seeds match.</div></td></tr>';
    $('#seed-pager').innerHTML = '<button ' + (state.seeds.page <= 1 ? 'disabled' : '') + ' data-page="' + (state.seeds.page - 1) + '">Previous</button><span class="page">Page ' + state.seeds.page + ' of ' + pages + '</span><button ' + (state.seeds.page >= pages ? 'disabled' : '') + ' data-page="' + (state.seeds.page + 1) + '">Next</button>';
    $$('#seed-pager button').forEach((b) => b.addEventListener('click', () => { state.seeds.page = Number(b.dataset.page); renderSeeds(); }));
    $$('#seed-body tr[data-i]').forEach((tr) => tr.addEventListener('click', () => openSeed(seedFiltered[Number(tr.dataset.i)])));
  }
  function openSeed(s) {
    const top = (s.g || []).map((x, i) => '<li><span class="mono small">#' + (x.r || i + 1) + '</span> ' + link(x.u, x.t) + ' <span class="small muted">' + esc(x.d) + '</span><div class="small muted">' + esc(x.sn || '') + '</div></li>').join('');
    const auto = (s.a || []).map((x) => '<span class="chip" style="margin:3px 4px 3px 0">' + esc(x) + '</span>').join('');
    const paa = (s.paa || []).map((x) => '<li>' + esc(x) + '</li>').join('');
    const close = (s.m || []).map((m) => '<li>' + link(m.u, m.t) + ' <span class="small muted">match ' + m.s + '</span></li>').join('');
    const idea = s.idea ? '<div class="callout ' + (s.idea.verdict === 'new' ? '' : 'neutral') + '"><div class="kicker">Proposed page · ' + esc(OVERLAP[s.idea.verdict] || s.idea.verdict) + '</div><p><strong>' + esc(s.idea.title) + '</strong></p><p class="small">' + esc(s.idea.slug) + '</p>' + (s.idea.reason ? '<p class="small">' + esc(s.idea.reason) + '</p>' : '') + '</div>' : '';
    const html = '<div class="row" style="margin-bottom:12px">' + ovBadge(s.ov) + '<span class="chip">' + esc(cname(s.c)) + '</span><span class="chip">' + esc(sname(s.sub)) + '</span><span class="chip">priority ' + esc(s.p) + '</span></div>' +
      '<dl class="kv"><dt>Keywords</dt><dd>' + fmt(s.n) + ' · demand ' + one(s.d) + '</dd><dt>Autocomplete</dt><dd>' + fmt((s.a || []).length) + ' saved</dd><dt>Top 10</dt><dd>' + fmt((s.g || []).length) + ' results</dd><dt>PAA</dt><dd>' + fmt((s.paa || []).length) + ' questions</dd></dl>' +
      (idea ? '<h4 style="margin-top:18px">Page idea</h4>' + idea : '') +
      '<h4 style="margin-top:18px">Top 10 results</h4>' + (top ? '<ul class="list">' + top + '</ul>' : '<p class="small muted">No Bing results saved.</p>') +
      '<h4 style="margin-top:18px">Autocomplete</h4>' + (auto || '<p class="small muted">No suggestions.</p>') +
      (paa ? '<h4 style="margin-top:18px">People Also Ask</h4><ul class="list">' + paa + '</ul>' : '') +
      '<h4 style="margin-top:18px">Closest live pages</h4>' + (close ? '<ul class="list">' + close + '</ul>' : '<p class="small muted">None matched.</p>');
    openDrawer(s.s, cname(s.c) + ' · ' + sname(s.sub), html);
  }

  // ---------- Keywords ----------
  let kwFiltered = [];
  const KW_PAGE = 50;
  function renderKeywords() {
    if (!K) return;
    const q = state.kw.q.trim().toLowerCase();
    const out = K.filter((k) => (!state.kw.cluster || k.c === state.kw.cluster) && (!state.kw.overlap || k.ov === state.kw.overlap) && (!state.kw.type || (state.kw.type === 'q' ? k.q : !k.q)) && (!q || k.k.includes(q)));
    out.sort((a, b) => (b.d - a.d) || a.k.localeCompare(b.k));
    kwFiltered = out;
    const pages = Math.max(1, Math.ceil(out.length / KW_PAGE));
    if (state.kw.page > pages) state.kw.page = pages;
    const start = (state.kw.page - 1) * KW_PAGE;
    const slice = out.slice(start, start + KW_PAGE);
    $('#kw-count').textContent = fmt(out.length) + ' keywords';
    $('#kw-kicker').textContent = fmt(M.keywords) + ' harvested queries';
    $('#kw-body').innerHTML = slice.map((k, i) => {
      const m = k.m && k.m[0];
      return '<tr class="rowlink" data-i="' + (start + i) + '"><td class="kw">' + esc(k.k) + '<span class="tiny">' + (k.q ? 'Question' : 'Topic') + '</span></td><td>' + esc(cname(k.c)) + '</td><td class="mono">' + one(k.d) + '</td><td>' + (k.q ? badge('Question', 'possible') : badge('Topic', '')) + '</td><td class="small">' + esc((k.seeds || []).join(' · ')) + '</td><td class="url">' + (m ? link(m.u, m.t) : '<span class="muted">None</span>') + '</td><td>' + ovBadge(k.ov) + '</td></tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty">No keywords match.</div></td></tr>';
    $('#kw-pager').innerHTML = '<button ' + (state.kw.page <= 1 ? 'disabled' : '') + ' data-page="' + (state.kw.page - 1) + '">Previous</button><span class="page">Page ' + state.kw.page + ' of ' + pages + '</span><button ' + (state.kw.page >= pages ? 'disabled' : '') + ' data-page="' + (state.kw.page + 1) + '">Next</button>';
    $$('#kw-pager button').forEach((b) => b.addEventListener('click', () => { state.kw.page = Number(b.dataset.page); renderKeywords(); }));
    $$('#kw-body tr[data-i]').forEach((tr) => tr.addEventListener('click', () => openKeyword(kwFiltered[Number(tr.dataset.i)])));
  }
  function openKeyword(k) {
    const m = (k.m || []).map((x) => '<li>' + link(x.u, x.t) + ' <span class="small muted">match ' + x.s + '</span></li>').join('');
    openDrawer(k.k, cname(k.c) + ' · demand ' + one(k.d), '<div class="row" style="margin-bottom:12px">' + ovBadge(k.ov) + '<span class="chip">' + (k.q ? 'Question' : 'Topic') + '</span></div><dl class="kv"><dt>Seeds</dt><dd>' + esc((k.seeds || []).join(' · ')) + '</dd><dt>Sources</dt><dd>' + esc((k.src || []).join(', ')) + '</dd><dt>Demand</dt><dd>' + one(k.d) + '</dd></dl><h4 style="margin-top:18px">Closest live pages</h4>' + (m ? '<ul class="list">' + m + '</ul>' : '<p class="small muted">No close page.</p>'));
  }

  // ---------- Ideas ----------
  let ideaFiltered = [];
  const IDEA_PAGE = 40;
  function ideaScore(x) { return x.d + x.n * 3 + x.pri * 2 + (x.judge === 'new' ? 4 : 0); }
  function renderIdeas() {
    if (!I) return;
    const q = state.ideas.q.trim().toLowerCase();
    const out = I.filter((x) => (!state.ideas.cluster || x.c === state.ideas.cluster) && (!state.ideas.verdict || x.judge === state.ideas.verdict) && (!q || (x.title + ' ' + x.slug + ' ' + x.primary + ' ' + (x.supp || []).join(' ')).toLowerCase().includes(q)));
    const rank = { new: 0, partial: 1, pending: 2, merge: 3, overlap: 4 };
    out.sort((a, b) => rank[a.judge] - rank[b.judge] || ideaScore(b) - ideaScore(a));
    ideaFiltered = out;
    const pages = Math.max(1, Math.ceil(out.length / IDEA_PAGE));
    if (state.ideas.page > pages) state.ideas.page = pages;
    const start = (state.ideas.page - 1) * IDEA_PAGE;
    $('#idea-count').textContent = fmt(out.length) + ' ideas';
    $('#idea-body').innerHTML = out.slice(start, start + IDEA_PAGE).map((x, i) => {
      const c = x.closest && x.closest[0];
      return '<tr class="rowlink" data-i="' + (start + i) + '"><td class="kw">' + esc(x.title) + '<span class="tiny">' + esc(x.slug) + '</span></td><td>' + esc(cname(x.c)) + '</td><td class="url">' + esc(x.primary) + '</td><td class="mono small">' + fmt(x.n) + '<span class="tiny">' + esc(sname(x.sub)) + '</span></td><td class="url">' + (c ? link(c.u, c.t) : '<span class="muted">None</span>') + '</td><td>' + ovBadge(x.judge) + '</td></tr>';
    }).join('') || '<tr><td colspan="6"><div class="empty">No ideas match.</div></td></tr>';
    $('#idea-pager').innerHTML = '<button ' + (state.ideas.page <= 1 ? 'disabled' : '') + ' data-page="' + (state.ideas.page - 1) + '">Previous</button><span class="page">Page ' + state.ideas.page + ' of ' + pages + '</span><button ' + (state.ideas.page >= pages ? 'disabled' : '') + ' data-page="' + (state.ideas.page + 1) + '">Next</button>';
    $$('#idea-pager button').forEach((b) => b.addEventListener('click', () => { state.ideas.page = Number(b.dataset.page); renderIdeas(); }));
    $$('#idea-body tr[data-i]').forEach((tr) => tr.addEventListener('click', () => openIdea(ideaFiltered[Number(tr.dataset.i)])));
  }
  function openIdea(x) {
    const supp = (x.supp || []).map((s) => '<span class="chip" style="margin:3px 4px 3px 0">' + esc(s) + '</span>').join('');
    const close = (x.closest || []).map((m) => '<li>' + link(m.u, m.t) + ' <span class="small muted">match ' + m.s + '</span></li>').join('');
    const html = '<div class="row" style="margin-bottom:12px">' + ovBadge(x.judge) + '<span class="chip">' + esc(cname(x.c)) + '</span><span class="chip">' + esc(sname(x.sub)) + '</span><span class="chip">' + fmt(x.n) + ' keywords</span></div>' +
      (x.jreason ? '<div class="callout"><div class="kicker">Verdict</div><p class="small">' + esc(x.jreason) + '</p>' + (x.jurl ? '<p class="small">Closest page: ' + link(x.jurl, x.jurl) + '</p>' : '') + '</div>' : '') +
      (x.sharpen ? '<h4 style="margin-top:14px">Sharper title</h4><p class="small">' + esc(x.sharpen) + '</p>' : '') +
      '<dl class="kv"><dt>Slug</dt><dd><code>' + esc(x.slug) + '</code></dd><dt>Primary keyword</dt><dd>' + esc(x.primary) + '</dd><dt>Demand</dt><dd>' + one(x.d) + '</dd><dt>Intent</dt><dd>' + esc(x.intent) + '</dd></dl>' +
      '<h4 style="margin-top:18px">Why distinct</h4><p class="small">' + esc(x.why) + '</p>' +
      '<h4 style="margin-top:18px">Supporting keywords</h4><div>' + (supp || '<span class="small muted">None</span>') + '</div>' +
      '<h4 style="margin-top:18px">Closest live pages</h4>' + (close ? '<ul class="list">' + close + '</ul>' : '<p class="small muted">None.</p>') +
      '<div class="row" style="margin-top:18px"><button class="btn btn-ghost" id="copy-idea">Copy page brief</button></div>';
    openDrawer(x.title, x.slug, html);
    $('#copy-idea').addEventListener('click', () => copyText([x.title, x.slug, x.primary, x.intent, x.why, (x.supp || []).join(', '), x.judge, x.jreason].join('\n')));
  }

  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0e2732;color:#fff;padding:9px 16px;border-radius:8px;font-size:13px;z-index:90'; document.body.appendChild(el); }
    el.textContent = msg; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 1600);
  }
  function copyText(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Copied')).catch(() => {}); }
  function exportIdeas() {
    const rows = ideaFiltered.length ? ideaFiltered : [];
    const lines = ['title,slug,cluster,primary,supporting,keywords,demand,verdict,reason,closest'];
    for (const x of rows) lines.push([x.title, x.slug, cname(x.c), x.primary, (x.supp || []).join(' | '), x.n, x.d, x.judge, x.jreason, x.closest && x.closest[0] ? x.closest[0].u : ''].map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tcp-v2-ideas.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function renderMethod() {
    $('#method-steps').innerHTML = [
      'Build the seed taxonomy from credit repair, credit score, mortgage, auto, car models, companies, state programs, business credit, documents and life events.',
      'Add every 2026 car model plus 2021 and 2018 used models at make/model level.',
      'Harvest live Bing autocomplete and Bing top 10 for every seed.',
      'Add a Google PAA sample for high-priority mortgage and auto seeds.',
      'Match every keyword to 13,105 live pages with SQLite FTS5 and Porter stemming.',
      'Generate page ideas from the seed groups and judge each against the closest live pages.',
    ].map((x) => '<li>' + esc(x) + '</li>').join('');
    const rows = [['Seeds', M.seeds], ['Seeds with autocomplete', M.with_autocomplete], ['Seeds with Bing top 10', M.with_serp], ['Seeds with PAA', M.with_paa], ['Keywords', M.keywords], ['Page ideas', M.ideas], ['Live pages checked', M.site_total]];
    $('#inventory').innerHTML = '<div class="grid grid-3">' + rows.map((r) => '<div class="card tight"><div class="small muted">' + esc(r[0]) + '</div><div class="mono" style="font-size:20px">' + fmt(r[1]) + '</div></div>').join('') + '</div>';
  }

  function bind() {
    let t1;
    $('#seed-search').addEventListener('input', (e) => { clearTimeout(t1); t1 = setTimeout(() => { state.seeds.q = e.target.value; state.seeds.page = 1; renderSeeds(); }, 140); });
    $('#seed-cluster').addEventListener('change', (e) => { state.seeds.cluster = e.target.value; state.seeds.page = 1; renderSeeds(); });
    $('#seed-sub').addEventListener('change', (e) => { state.seeds.sub = e.target.value; state.seeds.page = 1; renderSeeds(); });
    $('#seed-priority').addEventListener('change', (e) => { state.seeds.priority = e.target.value; state.seeds.page = 1; renderSeeds(); });
    $('#seed-overlap').addEventListener('change', (e) => { state.seeds.overlap = e.target.value; state.seeds.page = 1; renderSeeds(); });

    let t2;
    $('#kw-search').addEventListener('input', (e) => { clearTimeout(t2); t2 = setTimeout(() => { state.kw.q = e.target.value; state.kw.page = 1; renderKeywords(); }, 140); });
    $('#kw-cluster').addEventListener('change', (e) => { state.kw.cluster = e.target.value; state.kw.page = 1; renderKeywords(); });
    $('#kw-overlap').addEventListener('change', (e) => { state.kw.overlap = e.target.value; state.kw.page = 1; renderKeywords(); });
    $('#kw-type').addEventListener('change', (e) => { state.kw.type = e.target.value; state.kw.page = 1; renderKeywords(); });

    let t3;
    $('#idea-search').addEventListener('input', (e) => { clearTimeout(t3); t3 = setTimeout(() => { state.ideas.q = e.target.value; state.ideas.page = 1; renderIdeas(); }, 140); });
    $('#idea-cluster').addEventListener('change', (e) => { state.ideas.cluster = e.target.value; state.ideas.page = 1; renderIdeas(); });
    $('#idea-verdict').addEventListener('change', (e) => { state.ideas.verdict = e.target.value; state.ideas.page = 1; renderIdeas(); });
    $('#idea-clear').addEventListener('click', () => { state.ideas.verdict = state.ideas.verdict === 'new' ? '' : 'new'; $('#idea-verdict').value = state.ideas.verdict; state.ideas.page = 1; renderIdeas(); });
    $('#idea-export').addEventListener('click', exportIdeas);
  }

  function init() {
    fill('#seed-cluster', CLUSTERS, 'All categories');
    fill('#kw-cluster', CLUSTERS, 'All categories');
    fill('#idea-cluster', CLUSTERS, 'All categories');
    $('#seed-sub').innerHTML = '<option value="">All subcategories</option>' + Object.keys(SUBS).sort().map((k) => '<option value="' + esc(k) + '">' + esc(SUBS[k]) + '</option>').join('');
    renderStats(); renderClusters(); renderSources(); renderLimits(); renderMethod(); renderSeeds(); renderConverted();
    bind();
    const hash = (location.hash || '').replace('#', '');
    setView(document.getElementById('view-' + hash) ? hash : 'overview');
    ensureIdeas().then(renderTop).catch(() => {});
    $('#loading').style.display = 'none';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
