/* 친환경농업 법령 검색 — 서버 없이 동작하는 PWA */
'use strict';
const APP_VERSION = '1.0.0';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOTS = '·ㆍ‧・∙･⋅';
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(new RegExp('[' + DOTS + ']', 'g'), '·');

/* 국가법령정보센터 링크 (법령명으로 바로 가는 주소) */
const LAWGO = {
  act: 'https://www.law.go.kr/법령/친환경농어업육성및유기식품등의관리ㆍ지원에관한법률',
  decree: 'https://www.law.go.kr/법령/친환경농어업육성및유기식품등의관리ㆍ지원에관한법률시행령',
  rule: 'https://www.law.go.kr/법령/농림축산식품부소관친환경농어업육성및유기식품등의관리ㆍ지원에관한법률시행규칙',
  lact: 'https://www.law.go.kr/법령/축산법',
  ldecree: 'https://www.law.go.kr/법령/축산법시행령',
  lrule: 'https://www.law.go.kr/법령/축산법시행규칙',
  n1: 'https://www.law.go.kr/행정규칙/유기식품ㆍ무농약농산물ㆍ무항생제축산물등의인증업무위임규정',
  n2: 'https://www.law.go.kr/행정규칙/유기식품및무농약농산물등의인증기관지정ㆍ운영요령',
  n3: 'https://www.law.go.kr/행정규칙/유기식품및무농약농산물등의인증에관한세부실시요령',
  n4: 'https://www.law.go.kr/행정규칙/허용물질의선정기준및절차에관한기준',
  n5: 'https://www.law.go.kr/행정규칙/(국립농산물품질관리원)유기가공식품동등성인정및관리요령',
  m1: 'https://www.law.go.kr/행정규칙/무항생제축산물의인증기관지정ㆍ운영요령',
  m2: 'https://www.law.go.kr/행정규칙/무항생제축산물인증에관한세부실시요령',
};
/* 본문 속 "법/영/규칙 제○조"가 가리키는 법령 */
const ECO = { 법: 'act', 영: 'decree', 규칙: 'rule' }, LIVE = { 법: 'lact', 영: 'ldecree', 규칙: 'lrule' };
const FAMILY = { act: ECO, decree: ECO, rule: ECO, n1: ECO, n2: ECO, n3: ECO, n4: ECO, n5: ECO, lact: LIVE, ldecree: LIVE, lrule: LIVE, m1: LIVE, m2: LIVE };

const S = { laws: [], items: [], byId: new Map(), lawById: new Map(), q: '', kind: '', law: '', limit: 60, cur: null,
  fav: new Set(), results: null };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
};

/* ───────── 초기화 ───────── */
async function init() {
  applyPrefs();
  $('#list').innerHTML = '<div class="empty">자료를 불러오는 중…</div>';
  let data;
  try {
    data = await (await fetch('data/laws.json')).json();
  } catch (e) {
    $('#list').innerHTML = '<div class="empty">자료를 불러오지 못했습니다.<br>인터넷에 연결된 상태에서 한 번 열어 주세요.</div>';
    return;
  }
  S.meta = data.meta; S.laws = data.laws; S.items = data.items;
  S.laws.forEach((l) => S.lawById.set(l.id, l));
  S.items.forEach((it, i) => {
    it._i = i; S.byId.set(it.id, it);
    const law = S.lawById.get(it.law);
    it._nt = norm(law.short + it.no + it.title + (it.chapter || ''));
    it._nno = norm(it.no);
    it._nb = norm(it.body);
    it._no = norm(it.ocr);
  });
  S.fav = new Set(store.get('fav', []).filter((id) => S.byId.has(id)));
  buildLawSelect();
  bind();
  route();
  renderList();
  $('#about').textContent = `자료: ${S.meta.source} · 항목 ${S.items.length.toLocaleString()}건 · 앱 ${APP_VERSION}`;
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then(updateOfflineState).catch(() => updateOfflineState());
  } else updateOfflineState();
}

function buildLawSelect() {
  const sel = $('#lawSel');
  const groups = new Map();
  S.laws.forEach((l) => { if (!groups.has(l.group)) groups.set(l.group, []); groups.get(l.group).push(l); });
  let h = '<option value="">법령·문서 전체</option>';
  for (const [g, ls] of groups) {
    h += `<optgroup label="${esc(g)}">` + ls.map((l) => `<option value="${l.id}">${esc(l.short)}</option>`).join('') + '</optgroup>';
  }
  sel.innerHTML = h;
}

/* ───────── 검색 ───────── */
function reChar(c) { return DOTS.includes(c) ? '[' + DOTS + ']' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function looseRe(text) {              // 띄어쓰기와 가운뎃점 종류를 무시하는 정규식
  const cs = Array.from(text.replace(/\s+/g, ''));
  if (!cs.length) return null;
  return cs.map(reChar).join('\\s*');
}
function hlRegex(q) {
  const parts = [q].concat(q.trim().split(/\s+/)).map(looseRe).filter(Boolean);
  const uniq = Array.from(new Set(parts)).sort((a, b) => b.length - a.length);
  return uniq.length ? new RegExp('(' + uniq.join('|') + ')', 'gi') : null;
}
function parseArticleQuery(q) {
  // "제19조", "19조의2", "시행규칙 제11조", "별표 4", "별지 제9호서식"
  const m = q.trim().match(/^(.*?)\s*(?:제\s*)?(\d+)\s*조(?:\s*의\s*(\d+))?$/);
  if (m) return { hint: norm(m[1]), no: norm('제' + m[2] + '조' + (m[3] ? '의' + m[3] : '')) };
  const t = q.trim().match(/^(.*?)\s*별표\s*(\d+)(?:\s*의\s*(\d+))?$/);
  if (t) return { hint: norm(t[1]), no: norm('별표' + t[2] + (t[3] ? '의' + t[3] : '')) };
  const f = q.trim().match(/^(.*?)\s*(?:별지\s*)?제?\s*(\d+)\s*호(?:\s*의\s*(\d+))?\s*서식$/);
  if (f) return { hint: norm(f[1]), no: norm('별지제' + f[2] + '호' + (f[3] ? '의' + f[3] : '') + '서식') };
  return null;
}
function scope() {
  return S.items.filter((it) => (!S.kind || it.kind === S.kind) && (!S.law || it.law === S.law));
}
function search() {
  const q = S.q.trim();
  if (!q) return null;
  const pool = scope();
  const phrase = norm(q);
  const toks = q.split(/\s+/).map(norm).filter(Boolean);
  const art = parseArticleQuery(q);
  const exact = [], text = [];
  for (const it of pool) {
    if (art && it._nno === art.no) {
      const law = S.lawById.get(it.law);
      if (!art.hint || norm(law.short).includes(art.hint) || norm(law.name).includes(art.hint) ||
          (art.hint === '법' && /^(act|lact)$/.test(it.law)) || (/^(규칙|시행규칙)$/.test(art.hint) && /rule$/.test(it.law)) ||
          (/^(영|시행령)$/.test(art.hint) && /decree$/.test(it.law))) { exact.push({ it, where: 'no', score: 1000 }); continue; }
    }
    let score = 0, where = '';
    if (it._nt.includes(phrase)) { score = 500; where = 'title'; }
    else if (it._nb.includes(phrase)) { score = 300; where = 'body'; }
    else if (it._no.includes(phrase)) { score = 120; where = 'ocr'; }
    else if (toks.length > 1) {
      const all = it._nt + '\n' + it._nb, allo = all + '\n' + it._no;
      if (toks.every((t) => all.includes(t))) { score = 60; where = 'body'; }
      else if (toks.every((t) => allo.includes(t))) { score = 30; where = 'ocr'; }
    }
    if (score) text.push({ it, where, score });
  }
  text.sort((a, b) => b.score - a.score || a.it._i - b.it._i);
  return { exact, text, re: hlRegex(q), art };
}
function snippet(it, where, re) {
  const src = where === 'ocr' ? it.ocr : it.body;
  if (!src) return '';
  const flat = src.replace(/\s*\n\s*/g, ' ');
  let idx = 0, len = 0;
  if (re) { re.lastIndex = 0; const m = re.exec(flat); if (m) { idx = m.index; len = m[0].length; } }
  const a = Math.max(0, idx - 28), b = Math.min(flat.length, idx + len + 70);
  return (a > 0 ? '…' : '') + mark(flat.slice(a, b), re) + (b < flat.length ? '…' : '');
}
function mark(text, re) {
  if (!re) return esc(text);
  let out = '', last = 0; re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

/* ───────── 목록 ───────── */
function itemLabel(it) {
  return (it.no ? `<span class="no">${esc(it.no)}</span>` : '') + esc(it.title || (it.type === '부칙' ? '' : ''));
}
function resultRow(r, re) {
  const it = r.it, law = S.lawById.get(it.law);
  const tag = r.where === 'ocr' ? `<span class="tag">${it.kind === '세부지침' ? '표 안 텍스트' : '별표 OCR 검색'}</span>` : '';
  const variant = it.variant ? `<span class="tag">${esc(it.variant)}</span>` : '';
  const sn = r.where === 'no' ? esc((it.body || '').replace(/\n/g, ' ').slice(0, 90)) : snippet(it, r.where === 'title' ? 'body' : r.where, re);
  return `<button class="item${S.cur === it.id ? ' sel' : ''}" data-id="${it.id}">
    <div class="l1"><span class="badge k-${it.kind}">${it.kind}</span><span>${esc(law.short)}</span>${tag}${variant}</div>
    <div class="l2">${it.no ? `<span class="no">${mark(it.no, r.where === 'no' ? null : re)}</span>` : ''}${mark(it.title, re)}</div>
    ${sn ? `<div class="l3">${sn}</div>` : ''}</button>`;
}
function renderList() {
  const el = $('#list');
  const res = S.results = search();
  if (res) {
    const total = res.exact.length + res.text.length;
    if (!total) { el.innerHTML = `<div class="empty">“${esc(S.q)}” 검색 결과가 없습니다.<br><small>띄어쓰기는 무시하고 찾습니다. 필터를 ‘전체’로 바꿔 보세요.</small></div>`; return; }
    let h = '';
    if (res.exact.length) {
      h += `<div class="sec">조번호 일치 ${res.exact.length}건</div>` + res.exact.map((r) => resultRow(r, res.re)).join('');
      if (res.text.length) h += `<div class="sec">본문에서 “${esc(S.q)}” 언급 ${res.text.length.toLocaleString()}건</div>`;
    } else h += `<div class="count">검색 결과 ${total.toLocaleString()}건</div>`;
    h += res.text.slice(0, S.limit).map((r) => resultRow(r, res.re)).join('');
    if (res.text.length > S.limit) h += `<button class="more" id="more">더 보기 (${(res.text.length - S.limit).toLocaleString()}건 남음)</button>`;
    el.innerHTML = h;
    return;
  }
  if (S.law) { el.innerHTML = lawToc(S.lawById.get(S.law)); return; }
  // 첫 화면: 즐겨찾기 + 법령 목록
  let h = '';
  const favs = S.items.filter((it) => S.fav.has(it.id) && (!S.kind || it.kind === S.kind));
  if (favs.length) h += `<div class="sec">★ 즐겨찾기 ${favs.length}건</div>` + favs.map((it) => resultRow({ it, where: 'no' }, null)).join('');
  let g = '';
  for (const l of S.laws) {
    if (S.kind && l.kind !== S.kind) continue;
    if (l.group !== g) { g = l.group; h += `<div class="sec">${esc(g)}</div>`; }
    const n = S.items.filter((it) => it.law === l.id).length;
    h += `<button class="item lawRow" data-law="${l.id}"><div class="l2">${esc(l.short)}</div>
      <div class="l1"><span class="badge k-${l.kind}">${l.kind}</span><span>${n}건</span><span>${esc(lawDate(l))}</span></div></button>`;
  }
  el.innerHTML = h;
}
function lawDate(l) {
  if (l.kind === '세부지침') return l.enforce ? '시행 ' + l.enforce : '시행일자 미표기';
  const m = (l.enforce || '').match(/\[시행\s*([^\]]+)\]/);
  return m ? '시행 ' + m[1].trim() : '';
}
function lawToc(l) {
  const its = S.items.filter((it) => it.law === l.id);
  let h = `<div class="lawHead"><span class="badge k-${l.kind}">${l.kind}</span>
    <h2>${esc(l.name)}</h2><p>${esc(l.kind === '세부지침' ? `${l.field} · ${lawDate(l)} · 모음집 p.${l.pageStart}~${l.pageEnd}` : l.enforce)}</p>
    <p>${esc(l.source || '')}</p>
    ${LAWGO[l.id] ? `<a class="linkBtn" href="${LAWGO[l.id]}" target="_blank" rel="noopener">국가법령정보센터에서 최신 내용 보기 ↗</a>` : ''}</div>`;
  let ch = null;
  for (const it of its) {
    if ((it.chapter || '') !== ch) { ch = it.chapter || ''; if (ch) h += `<div class="sec">${esc(ch)}</div>`; }
    h += `<button class="item${S.cur === it.id ? ' sel' : ''}" data-id="${it.id}"><div class="l2">${itemLabel(it)}${it.variant ? ` <span class="tag">${esc(it.variant)}</span>` : ''}</div></button>`;
  }
  return h;
}

/* ───────── 본문 ───────── */
function resolveRef(it, pre, kind, a, b) {
  // pre: 앞에 붙은 말(「…」, 법, 영, 규칙 …), kind: 조|별표|서식
  let lawId = it.law;
  const fam = FAMILY[it.law];
  if (!fam) return null;
  const p = pre.replace(/\s+/g, '');
  if (p) {
    if (/^같은/.test(p) || /^동/.test(p)) return null;
    const q = p.replace(/[「」]/g, '');
    const lvl = /시행규칙$|규칙$/.test(q) ? '규칙' : /시행령$|영$/.test(q) ? '영' : '법';
    const name = q.replace(/(시행규칙|시행령|규칙|영|법)$/, '');
    if (/^「/.test(p) || name) {
      if (/친환경농어업/.test(q)) lawId = ECO[lvl];
      else if (/^축산$/.test(name) || /^축산법/.test(q)) lawId = LIVE[lvl];
      else if (name === '' || name === '이') lawId = name === '이' ? it.law : fam[lvl];
      else return null;                       // 다른 법률
    } else lawId = fam[lvl];
    if (kind !== '조' && lvl === '법') return null;
  }
  const id = kind === '조' ? `${lawId}-${a}${b ? '-' + b : ''}` : kind === '별표' ? `${lawId}-t${a}${b ? '_' + b : ''}` : `${lawId}-f${a}${b ? '_' + b : ''}`;
  return S.byId.has(id) && id !== it.id ? id : null;
}
const REF_RE = /((?:「[^」\n]{2,60}」|같은\s*법(?:\s*시행령|\s*시행규칙)?|동법|[가-힣]{0,12}?(?:시행규칙|시행령|규칙|법|영))\s*)?(?:제(\d+)조(?:의(\d+))?|별표\s*(\d+)(?:의(\d+))?|별지\s*제(\d+)호(?:의(\d+))?서식)/g;
function linkify(it, text, re) {
  // 법령·고시 본문: 조문·별표·서식 인용에 링크. 세부지침: 미리 계산한 refs 사용.
  const segs = [];
  let last = 0;
  if (it.kind === '세부지침') {
    const refs = (it.refs || []).slice().sort((x, y) => y.t.length - x.t.length);
    if (refs.length) {
      const rr = new RegExp(refs.map((r) => r.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      let m;
      while ((m = rr.exec(text))) {
        const r = refs.find((x) => x.t === m[0]);
        segs.push([text.slice(last, m.index), null], [m[0], r.id]); last = m.index + m[0].length;
      }
    }
  } else {
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(text))) {
      const pre = m[1] || '';
      const kind = m[2] ? '조' : m[4] ? '별표' : '서식';
      const id = resolveRef(it, pre, kind, m[2] || m[4] || m[6], m[3] || m[5] || m[7]);
      if (!id) continue;
      const start = m.index + pre.length;
      segs.push([text.slice(last, start), null], [m[0].slice(pre.length), id]); last = m.index + m[0].length;
    }
  }
  segs.push([text.slice(last), null]);
  return segs.map(([t, id]) => (id ? `<a class="ref" href="#/i/${id}" title="${esc(refTitle(id))}">${mark(t, re)}</a>` : mark(t, re))).join('');
}
function refTitle(id) { const t = S.byId.get(id), l = S.lawById.get(t.law); return `${l.short} ${t.no} ${t.title}`; }
function paraClass(p, guide) {
  if (guide) {
    if (/^[ㅇ◦○□◈]|^o\s/.test(p)) return 'l1';
    if (/^[-–·∙▪→]/.test(p)) return 'l2';
    if (/^[※*]/.test(p)) return 'l2 note';
    return '';
  }
  if (/^\[/.test(p)) return 'note';
  if (/^[①-⑳]/.test(p)) return 'l1';
  if (/^\d+(의\d+)?\.\s/.test(p)) return 'l2';
  if (/^[가-하]\.\s/.test(p)) return 'l3';
  if (/^\d+\)\s/.test(p)) return 'l4';
  return '';
}
function pageLabel(it) {
  const book = it.kind === '세부지침' ? '모음집' : '법령집';
  return `${book} p.${it.page}${it.pageEnd && it.pageEnd !== it.page ? '~' + it.pageEnd : ''}`;
}
function neighbors(it) {
  const prev = S.items[it._i - 1], next = S.items[it._i + 1];
  return [prev && prev.law === it.law ? prev : null, next && next.law === it.law ? next : null];
}
function renderDetail() {
  const el = $('#detail');
  const it = S.cur && S.byId.get(S.cur);
  if (!it) {
    el.innerHTML = `<div class="welcome"><p><b>친환경농업 법령 검색</b></p><p>왼쪽에서 검색하거나 법령을 골라 조문을 여세요.</p>
      <p class="small">키워드는 띄어쓰기를 무시하고 찾습니다.<br>“제19조”, “시행규칙 별표 4”처럼 조번호로도 찾을 수 있습니다.</p></div>`;
    return;
  }
  const law = S.lawById.get(it.law), guide = it.kind === '세부지침';
  const re = S.results ? S.results.re : null;
  const [prev, next] = neighbors(it);
  const fav = S.fav.has(it.id);
  let h = `<div class="dbar"><button class="backBtn" id="back" aria-label="목록으로">‹ 목록</button>
    <button id="prevTop" ${prev ? '' : 'disabled'} aria-label="이전">‹ 이전</button><button id="nextTop" ${next ? '' : 'disabled'} aria-label="다음">다음 ›</button>
    <span class="sp"></span><button id="copy">복사</button><button id="fav" class="fav${fav ? ' on' : ''}" aria-pressed="${fav}">${fav ? '★' : '☆'} 즐겨찾기</button></div>`;
  h += `<article><div class="crumb"><span class="badge k-${it.kind}">${it.kind}</span>${guide ? `<span class="badge">${esc(it.field)}</span>` : ''}
    <a href="#" data-law="${law.id}">${esc(law.short)}</a>${it.chapter ? `<span>› ${esc(it.chapter)}</span>` : ''}</div>
    <h1>${it.no ? `<span class="no">${esc(it.no)}</span>` : ''}${guide ? linkify(it, it.title, re) : mark(it.title, re)}</h1>
    <p class="meta">${esc(pageLabel(it))}${guide ? ' · ' + esc(lawDate(law)) : ''}${it.variant ? ` · <span class="tag">${esc(it.variant)} 시행 예정 조문</span>` : ''}</p>`;
  if (guide) {
    h += `<div class="banner">${esc(S.meta.guideNotice || '2022.6. 기준 자료이며 법령·고시와 다를 경우 법령·고시가 우선')}</div>`;
    if (it.refs && it.refs.length) h += '<p class="meta">본문 속 조문 링크는 법령집(2025.12.30.) 기준 조문으로 연결됩니다. 2022.6. 이후 개정으로 조번호가 바뀌었을 수 있습니다.</p>';
  }
  if (it.variant) h += '<div class="banner">같은 조번호의 현행 조문이 바로 앞에 실려 있습니다. 이 항목은 법령집에 함께 실린 장래 시행분입니다.</div>';
  if (it.body) {
    h += '<div class="body">' + it.body.split('\n').map((p) => `<p class="${paraClass(p, guide)}">${linkify(it, p, re)}</p>`).join('') + '</div>';
  }
  if (it.images && it.images.length) {
    const ocrNote = guide ? '표·그림이 있는 쪽은 원문 이미지로 보여 줍니다.' : '별표·서식은 법령집 쪽 이미지입니다. 검색은 글자 인식(OCR) 결과로 하므로 일부 누락될 수 있습니다.';
    h += `<p class="meta">${ocrNote} 이미지를 누르면 크게 볼 수 있습니다.</p>`;
    if (re && it.ocr) {
      const hits = [];
      const flat = it.ocr.split('\n');
      for (const line of flat) { re.lastIndex = 0; if (re.test(line)) { hits.push(line); if (hits.length >= 6) break; } }
      if (hits.length) h += `<div class="ocrBox"><h3>검색어가 들어 있는 줄 (${guide ? '표 안 텍스트' : 'OCR'})</h3>${hits.map((x) => `<p>${mark(x, re)}</p>`).join('')}</div>`;
    }
    h += it.images.map((src, i) => {
      const pg = guide ? (it.imagePages ? it.imagePages[i] : '') : parseInt(src.replace(/\D/g, ''), 10);
      const cap = `${guide ? '모음집' : '법령집'} p.${pg} (${i + 1}/${it.images.length})`;
      return `<figure><img loading="lazy" src="${src}" alt="${esc(it.no + ' ' + it.title)} ${cap}" data-cap="${esc(cap)}"><figcaption>${cap}</figcaption></figure>`;
    }).join('');
  }
  if (LAWGO[law.id]) h += `<p class="meta"><a href="${LAWGO[law.id]}" target="_blank" rel="noopener">국가법령정보센터에서 ${esc(law.short)} 최신 내용 보기 ↗</a></p>`;
  const nb = (x, label) => (x ? `<button data-go="${x.id}"><small>${label}</small><span>${esc((x.no + ' ' + x.title).trim())}</span></button>` : '<button disabled><small>' + label + '</small><span>없음</span></button>');
  h += `<div class="navRow">${nb(prev, '‹ 이전')}${nb(next, '다음 ›')}</div></article>`;
  el.innerHTML = h;
  el.scrollTop = 0;
  const first = el.querySelector('.body mark, .ocrBox mark');
  if (first && re) first.scrollIntoView({ block: 'center' });
}
function copyText(it) {
  const law = S.lawById.get(it.law);
  const head = `${law.short} ${it.no}${it.title ? (it.type === '조문' && it.title !== '삭제' ? `(${it.title})` : ' ' + it.title) : ''}`.trim();
  const body = it.body || (it.images ? `(${pageLabel(it)} 이미지 자료)` : '');
  return `${head}\n${body}\n— ${it.kind === '세부지침' ? '세부지침 및 설명자료 모음집(2022.6.)' : '법령집(2025.12.30. 발간)'} ${pageLabel(it).replace(/^\S+ /, '')}`;
}
async function doCopy(it) {
  const t = copyText(it);
  try { await navigator.clipboard.writeText(t); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* 무시 */ } ta.remove();
  }
  toast('복사했습니다');
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 1600); }

/* ───────── 이동(해시 라우팅) ───────── */
function go(id, replace) {
  const h = '#/i/' + id;
  if (replace) { history.replaceState(null, '', h); route(); } else location.hash = h;
}
function route() {
  if (!$('#viewer').hidden && !/\/v$/.test(location.hash)) closeViewer(true);
  const m = location.hash.match(/^#\/i\/([^/]+)/);
  const id = m && S.byId.has(decodeURIComponent(m[1])) ? decodeURIComponent(m[1]) : null;
  const changed = id !== S.cur;
  S.cur = id;
  document.body.classList.toggle('detail-open', !!id);
  if (changed) {
    renderDetail();
    document.querySelectorAll('#list .item.sel').forEach((x) => x.classList.remove('sel'));
    if (id) { const b = document.querySelector(`#list .item[data-id="${CSS.escape(id)}"]`); if (b) b.classList.add('sel'); }
  }
}
function openViewer(src, cap) {
  $('#vimg').src = src; $('#vimg').style.width = '100%'; $('#vcap').textContent = cap; $('#viewer').hidden = false;
  history.pushState(null, '', location.hash + '/v');
}
function closeViewer(fromPop) { $('#viewer').hidden = true; if (!fromPop && /\/v$/.test(location.hash)) history.back(); }

/* ───────── 설정 ───────── */
function applyPrefs() {
  const fs = store.get('fs', 16), th = store.get('theme', 'auto');
  document.documentElement.style.setProperty('--fs', fs + 'px');
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
  const v = $('#fsVal'); if (v) v.textContent = fs + 'px';
  document.querySelectorAll('#themeGrp button').forEach((b) => b.classList.toggle('on', b.dataset.theme === th));
}
function imageList() { const s = new Set(); S.items.forEach((it) => (it.images || []).forEach((x) => s.add(x))); return Array.from(s); }
async function updateOfflineState() {
  const st = $('#offState'), btn = $('#offBtn');
  if (!('caches' in window) || !location.protocol.startsWith('http')) { st.textContent = '이 환경에서는 오프라인 저장을 쓸 수 없습니다.'; btn.disabled = true; return; }
  const all = imageList();
  const cache = await caches.open('eco-law-images');
  const have = (await cache.keys()).length;
  st.textContent = have >= all.length
    ? `조문·검색 자료와 별표·서식 이미지 ${all.length}장이 모두 저장되어 있습니다. 인터넷 없이 쓸 수 있습니다.`
    : `조문·검색은 오프라인에서 됩니다. 별표·서식 이미지는 ${have}/${all.length}장 저장됨(약 34MB, Wi-Fi 권장).`;
  btn.disabled = have >= all.length;
  btn.textContent = have >= all.length ? '저장 완료' : have ? '이어서 내려받기' : '별표·서식 이미지 내려받기';
}
async function downloadImages() {
  const all = imageList(), cache = await caches.open('eco-law-images');
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const todo = all.filter((u) => !have.has(new URL(u, location.href).pathname));
  const prog = $('#offProg'), btn = $('#offBtn');
  prog.hidden = false; prog.max = all.length; prog.value = all.length - todo.length; btn.disabled = true;
  let fail = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const u = todo[i++];
      try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await cache.put(u, r); else fail++; } catch (e) { fail++; }
      prog.value++; $('#offState').textContent = `내려받는 중… ${prog.value}/${all.length}`;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  prog.hidden = true;
  await updateOfflineState();
  if (fail) toast(`${fail}장을 받지 못했습니다. 다시 눌러 이어받으세요.`); else { store.set('offline', true); toast('오프라인 저장 완료'); }
}

/* ───────── 이벤트 ───────── */
function bind() {
  let timer;
  $('#q').value = S.q;
  $('#q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { S.q = e.target.value; S.limit = 60; renderList(); $('#list').scrollTop = 0; }, 140); });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#kindChips').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.kind = b.dataset.kind; S.limit = 60;
    document.querySelectorAll('#kindChips button').forEach((x) => x.classList.toggle('on', x === b));
    if (S.law && S.kind && S.lawById.get(S.law).kind !== S.kind) { S.law = ''; $('#lawSel').value = ''; }
    renderList();
  });
  $('#lawSel').addEventListener('change', (e) => { S.law = e.target.value; S.limit = 60; renderList(); $('#list').scrollTop = 0; });
  $('#list').addEventListener('click', (e) => {
    const more = e.target.closest('#more'); if (more) { S.limit += 100; renderList(); return; }
    const lw = e.target.closest('[data-law]'); if (lw) { S.law = lw.dataset.law; $('#lawSel').value = S.law; renderList(); $('#list').scrollTop = 0; return; }
    const b = e.target.closest('[data-id]'); if (b) go(b.dataset.id, !!S.cur && matchMedia('(min-width: 600px)').matches);
  });
  $('#detail').addEventListener('click', (e) => {
    const t = e.target;
    const it = S.cur && S.byId.get(S.cur);
    if (t.closest('#back')) { if (history.length > 1) history.back(); else { location.hash = ''; } return; }
    const [prev, next] = it ? neighbors(it) : [];
    if (t.closest('#prevTop') && prev) return go(prev.id, true);
    if (t.closest('#nextTop') && next) return go(next.id, true);
    const g = t.closest('[data-go]'); if (g) return go(g.dataset.go, true);
    if (t.closest('#copy') && it) return doCopy(it);
    if (t.closest('#fav') && it) {
      if (S.fav.has(it.id)) S.fav.delete(it.id); else S.fav.add(it.id);
      store.set('fav', Array.from(S.fav)); toast(S.fav.has(it.id) ? '즐겨찾기에 추가했습니다' : '즐겨찾기에서 뺐습니다');
      renderDetailKeepScroll(); if (!S.q && !S.law) renderList(); return;
    }
    const lw = t.closest('a[data-law]');
    if (lw) { e.preventDefault(); S.q = ''; $('#q').value = ''; S.law = lw.dataset.law; $('#lawSel').value = S.law; S.kind = ''; document.querySelectorAll('#kindChips button').forEach((x) => x.classList.toggle('on', !x.dataset.kind)); renderList();
      if (!matchMedia('(min-width: 600px)').matches) { history.pushState(null, '', '#/'); route(); } return; }
    const img = t.closest('figure img'); if (img) openViewer(img.getAttribute('src'), img.dataset.cap);
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  $('#btnSettings').addEventListener('click', () => { applyPrefs(); updateOfflineState(); $('#settings').hidden = false; });
  $('#setClose').addEventListener('click', () => { $('#settings').hidden = true; });
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });
  const fsStep = (d) => { store.set('fs', Math.max(13, Math.min(26, store.get('fs', 16) + d))); applyPrefs(); };
  $('#fsDown').addEventListener('click', () => fsStep(-1));
  $('#fsUp').addEventListener('click', () => fsStep(1));
  $('#themeGrp').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { store.set('theme', b.dataset.theme); applyPrefs(); } });
  $('#offBtn').addEventListener('click', downloadImages);
  $('#vClose').addEventListener('click', () => closeViewer(false));
  const zoom = (f) => { const im = $('#vimg'); const w = Math.max(100, Math.min(400, (parseFloat(im.style.width) || 100) * f)); im.style.width = w + '%'; };
  $('#vIn').addEventListener('click', () => zoom(1.4));
  $('#vOut').addEventListener('click', () => zoom(1 / 1.4));
  $('#vimg').addEventListener('dblclick', () => zoom(($('#vimg').style.width === '100%') ? 2 : 0.01));
}
function renderDetailKeepScroll() { const el = $('#detail'), y = el.scrollTop; const r = S.results; S.results = null; renderDetail(); S.results = r; el.scrollTop = y; }

init();
