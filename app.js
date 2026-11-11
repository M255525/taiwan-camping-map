/* ================= 台灣露營地圖：介面 ================= */
(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };
var PREF_KEY = 'taiwanCampPrefs', SET_KEY = 'taiwanCampSettings', SEEN_KEY = 'taiwanCampSeenWarning', SEC_KEY = 'taiwanCampSetOpen';

function lsGet(k, d){ try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e){} }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
function nowMonth(){ return new Date().getMonth() + 1; }
function isNightNow(){ var h = new Date().getHours(); return h >= 18 || h < 6; }
function deg(v){ return Math.round(v) + '°C'; }

var set = Object.assign({month:'now', labels:true, layer:true, night:'day', motion:'auto', theme:'auto', play:1100}, lsGet(SET_KEY, {}));
var pref = lsGet(PREF_KEY, {});
var st = {month:set.month === 'last' && pref.month ? pref.month : nowMonth(), region:CM.regionById[pref.region] ? pref.region : 'all', spot:CM.spotById[pref.spot] ? pref.spot : null,
  layer:set.layer !== false, night:set.night === 'night' || (set.night === 'auto' && isNightNow())};
if (st.spot) st.region = CM.spotById[st.spot].r;
function save(){ lsSet(PREF_KEY, {month:st.month, region:st.region, spot:st.spot}); }
function reduceOn(){ return set.motion === 'reduce' || (set.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyTheme(){ if (set.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', set.theme); }
applyTheme();

function scoreChip(s, extra){ var x = CM.SCORES[s]; return '<span class="schip s' + s + '" title="' + esc(x.tip) + '">' + '●●●●●'.slice(0, s) + '<em>' + '●●●●●'.slice(s) + '</em> ' + x.name + (extra || '') + '</span>'; }
function wxChips(c){ return c.wx.map(function(k){ var w = CM.WXTYPES[k]; return '<span class="wx" title="' + esc(w.tip) + '">' + w.icon + ' ' + w.name + '</span>'; }).join(''); }
function hlNow(p, m){ return p.hl.filter(function(h){ return h.months[m]; }); }
function spotsInScope(){ return CM.SPOTS.filter(function(p){ return st.region === 'all' || p.r === st.region; }); }

/* ---------- 選擇器與月份軸 ---------- */
function fillSelectors(){
  $('selRegion').innerHTML = '<option value="all">全台灣</option>' + CM.REGIONS.map(function(r){ return '<option value="' + r.id + '">' + r.name + '｜' + r.sub + '</option>'; }).join('');
  $('selRegion').value = st.region;
  $('selSpot').innerHTML = '<option value="">' + (st.region === 'all' ? '選一個營地…' : '整個' + CM.regionById[st.region].name) + '</option>' +
    spotsInScope().map(function(p){ return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
  $('selSpot').value = st.spot || '';
}
function renderAxis(){
  var sp = spotsInScope(), cnt = [], i;
  for (i = 1; i <= 12; i++) cnt.push(sp.filter(function(p){ return CM.climate(p, i).score >= 4; }).length);
  var max = Math.max(1, Math.max.apply(null, cnt));
  $('axBars').innerHTML = cnt.map(function(n, k){
    var m = k + 1;
    return '<button type="button" class="axc' + (m === st.month ? ' on' : '') + '" data-m="' + m + '" title="' + CM.MON[k] + '：' + n + ' 個營地適合露營"><b>' + n + '</b><i style="height:' + Math.round(n / max * 30 + 2) + 'px"></i><span>' + m + '<small>月</small></span></button>';
  }).join('');
}

/* ---------- 天空：依月份＋日夜 ---------- */
function skyFor(m, nt){
  if (nt) return [[12, 20, 44], [44, 50, 86]];
  var s = [[170, 205, 232], [236, 228, 208]];
  if (m >= 6 && m <= 9) s = [[120, 190, 236], [226, 238, 214]];
  else if (m >= 10 || m <= 2) s = [[176, 196, 214], [238, 226, 204]];
  return s;
}

/* ---------- 清單 ---------- */
function spotCard(p){
  var c = CM.climate(p, st.month), h = hlNow(p, st.month);
  return '<button type="button" class="scard" data-spot="' + p.id + '"><b>' + CM.TYPES[p.type].icon + ' ' + esc(p.name) + '</b>' + scoreChip(c.score) +
    '<small>' + esc(p.city) + '・海拔約 ' + p.elev.toLocaleString() + ' m｜夜晚約 ' + deg(c.tn) + '、白天約 ' + deg(c.th) + (c.why.length ? '｜' + c.why.join('、') : '') +
    (h.length ? '<br>' + h.map(function(x){ return x[1] + ' ' + esc(x[2]); }).join('　') : '') + '</small></button>';
}
function yearStrip(p){
  var cells = '';
  for (var m = 1; m <= 12; m++){ var c = CM.climate(p, m); cells += '<button type="button" class="yc s' + c.score + (m === st.month ? ' on' : '') + '" data-m="' + m + '" title="' + m + '月：' + CM.SCORES[c.score].name + '，夜晚約 ' + deg(c.tn) + '"><span>' + m + '</span><em>' + Math.round(c.tn) + '°</em></button>'; }
  return '<div class="ystrip" aria-label="全年露營指數">' + cells + '</div>';
}
function render(opts){
  opts = opts || {};
  var m = st.month, sp = st.spot ? CM.spotById[st.spot] : null;
  $('monBig').textContent = m + '月';
  $('monSub').textContent = m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬';
  renderAxis();
  var sky = skyFor(m, st.night), stage = $('stage');
  stage.style.setProperty('--sky1', 'rgb(' + sky[0].join(',') + ')'); stage.style.setProperty('--sky2', 'rgb(' + sky[1].join(',') + ')');
  document.body.classList.toggle('night', st.night);
  $('btnNight').textContent = st.night ? '☀ 白天' : '🌙 夜晚';
  $('btnLayer').classList.toggle('on', st.layer);
  $('legendTemp').hidden = !st.layer;
  var place = $('place'), list = $('list'), scope = spotsInScope();
  var good = scope.filter(function(p){ return CM.climate(p, m).score >= 4; }).length;
  if (sp){
    var c = CM.climate(sp, m), h = hlNow(sp, m), gear = CM.gear(sp, c);
    place.innerHTML = '<h2>' + esc(sp.name) + '<small>' + esc(sp.city) + '</small></h2>' +
      '<div class="meta">' + scoreChip(c.score, '（' + m + '月）') + '<span>' + CM.TYPES[sp.type].icon + ' ' + CM.TYPES[sp.type].name + '</span><span>海拔約 ' + sp.elev.toLocaleString() + ' m</span></div>' +
      '<div class="temps"><div><small>夜晚約</small><b>' + deg(c.tn) + '</b></div><div><small>白天約</small><b>' + deg(c.th) + '</b></div><div><small>睡袋舒適溫度</small><b>' + CM.bagTemp(c.tn) + '°C 以下</b></div></div>' +
      (c.wx.length ? '<div class="wxrow">' + wxChips(c) + '</div>' : '') +
      yearStrip(sp) +
      (h.length ? '<ul class="hl">' + h.map(function(x){ return '<li>' + x[1] + ' ' + esc(x[2]) + '</li>'; }).join('') + '</ul>' : '') +
      '<p>' + esc(sp.note) + '</p>' +
      '<div class="gear"><b>🎒 ' + m + '月建議帶：</b>' + gear.map(function(g){ return '<span>' + esc(g) + '</span>'; }).join('') + '</div>' +
      '<details class="tips"' + (innerWidth > 760 ? ' open' : '') + '><summary>📌 這裡要注意</summary><ul>' + sp.tips.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') +
      (sp.fire ? '<li>用火：' + esc(sp.fire) + '</li>' : '') + '</ul></details>' +
      '<dl class="facts"><dt>管理</dt><dd>' + esc(sp.mgr) + '</dd><dt>營位</dt><dd>' + esc(sp.pitch) + '</dd>' + (sp.book ? '<dt>預約</dt><dd>' + esc(sp.book) + '（以官方公告為準）</dd>' : '<dt>預約</dt><dd>出發前先向營地確認（以官方公告為準）</dd>') + '</dl>';
    $('sum').innerHTML = '<span>' + m + '月・' + esc(CM.SCORES[c.score].tip) + '</span>';
    list.className = 'mini';
    list.innerHTML = '<div class="lgrp">同區的其他營地</div>' + CM.SPOTS.filter(function(p){ return p.r === sp.r && p.id !== sp.id; }).map(spotCard).join('');
  } else {
    var r = st.region === 'all' ? null : CM.regionById[st.region];
    var best = scope.slice().sort(function(a, b){ return CM.climate(b, m).score - CM.climate(a, m).score; })[0];
    place.innerHTML = '<h2>' + (r ? r.name : '全台灣') + '<small>' + (r ? r.sub + '・' : '') + scope.length + ' 個營地</small></h2>' +
      '<p>' + m + '月' + (good ? '有 <b>' + good + '</b> 個營地適合露營，最推薦：<button type="button" class="lnk" data-spot="' + best.id + '">' + esc(best.name) + '</button>。' : '沒有特別舒服的營地，選擇時要多留意天氣與溫度。') +
      (st.layer ? '地圖顏色是估算的夜間低溫：綠色最舒服、藍紫色很冷、橘紅色悶熱。' : '') + '</p>';
    $('sum').innerHTML = '<span>' + m + '月・' + (r ? r.name : '全台灣') + '</span><b>' + good + '</b><span>個營地適合（指數 4 以上）</span>';
    list.className = '';
    var sorted = scope.slice().sort(function(a, b){ var x = CM.climate(a, m), y = CM.climate(b, m); return y.score - x.score || Math.abs(x.tn - 15) - Math.abs(y.tn - 15); }), html = '', last = '';
    sorted.forEach(function(p){
      var s = CM.climate(p, m).score, g = s >= 4 ? '⛺ 這個月很適合' : s === 3 ? '🌤 可以，但看天氣' : '⚠ 這個月要注意';
      if (g !== last){ html += '<div class="lgrp">' + g + '</div>'; last = g; }
      html += spotCard(p);
    });
    list.innerHTML = html;
  }
  if (window.CampScene && CampScene.ready){
    CampScene.setMonth(m); CampScene.selectSpot(st.spot); CampScene.setLayer(st.layer); CampScene.setNight(st.night);
    CampScene.setHorizon(sky[1].map(function(v){ return v / 255; }));
    if (opts.fly){
      if (sp) CampScene.focusSpot(sp.id);
      else if (st.region !== 'all') CampScene.focusRegion(scope.map(function(p){ return p.id; }));
      else CampScene.overview();
    }
  }
  save();
}

/* ---------- 動作 ---------- */
function setMonth(m){ st.month = ((m - 1) % 12 + 12) % 12 + 1; render(); }
function selectSpot(id){ if (id && innerWidth <= 760 && $('panel').classList.contains('min')) setSheet(false); st.spot = id || null; if (st.spot) st.region = CM.spotById[st.spot].r; fillSelectors(); render({fly:true}); }
function selectRegion(r){ st.region = r; st.spot = null; fillSelectors(); render({fly:true}); }
function setNight(on){ st.night = !!on; render(); }
function setLayer(on){ st.layer = !!on; render(); }

var lastFocus = null;
function openModal(id){ lastFocus = document.activeElement; $(id).classList.add('show'); $(id).querySelector('.x').focus(); }
function closeModal(el){
  el.classList.remove('show');
  if (el.id === 'about') lsSet(SEEN_KEY, 1);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function buildEtiquette(){
  $('etqBody').innerHTML = CM.ETIQUETTE.map(function(e){
    return '<section><h3>' + e.icon + ' ' + esc(e.title) + '</h3><ul>' + e.items.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
  }).join('');
  $('glossBody').innerHTML = CM.GLOSSARY.map(function(g){ return '<div><b>' + esc(g[0]) + '</b><br>' + esc(g[1]) + '</div>'; }).join('');
  $('wxBody').innerHTML = Object.keys(CM.WXTYPES).map(function(k){ var w = CM.WXTYPES[k]; return '<div><b>' + w.icon + ' ' + w.name + '</b><br>' + esc(w.tip) + '</div>'; }).join('');
  $('lgScore').innerHTML = [5, 4, 3, 2, 1].map(function(s){ return '<span><i style="background:' + CM.SCORES[s].c + '"></i>' + CM.SCORES[s].name + '</span>'; }).join('');
}

/* ---------- 常用設定（收合式） ---------- */
function fillSettings(){
  $('setMonth').value = set.month; $('setNight').value = set.night; $('setLayer').checked = set.layer !== false; $('setLabels').checked = !!set.labels; $('setMotion').value = set.motion; $('setTheme').value = set.theme; $('setPlay').value = String(set.play);
  var txt = function(id){ var s = $(id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''; };
  $('sv-month').textContent = txt('setMonth'); $('sv-night').textContent = txt('setNight'); $('sv-layer').textContent = set.layer !== false ? '開' : '關'; $('sv-labels').textContent = set.labels ? '顯示' : '隱藏';
  $('sv-motion').textContent = txt('setMotion'); $('sv-play').textContent = txt('setPlay').replace(/（.*/, ''); $('sv-theme').textContent = txt('setTheme');
  var open = lsGet(SEC_KEY, []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; });
}
function saveSettings(){
  set = {month:$('setMonth').value, night:$('setNight').value, layer:$('setLayer').checked, labels:$('setLabels').checked, motion:$('setMotion').value, theme:$('setTheme').value, play:+$('setPlay').value};
  lsSet(SET_KEY, set); applyTheme();
  if (window.CampScene && CampScene.ready){ CampScene.setLabels(set.labels); CampScene.setReduce(reduceOn()); }
  if (playT){ stopPlay(); startPlay(); }
  fillSettings();
}
function saveSecs(){ lsSet(SEC_KEY, [].map.call(document.querySelectorAll('.set-sec[open]'), function(d){ return d.dataset.sec; })); }

/* ---------- 事件 ---------- */
function bind(){
  $('axBars').addEventListener('click', function(e){ var b = e.target.closest('.axc'); if (b){ stopPlay(); setMonth(+b.dataset.m); } });
  $('btnNow').addEventListener('click', function(){ stopPlay(); setMonth(nowMonth()); });
  $('btnNight').addEventListener('click', function(){ setNight(!st.night); });
  $('btnLayer').addEventListener('click', function(){ setLayer(!st.layer); });
  $('selRegion').addEventListener('change', function(){ selectRegion(this.value); });
  $('selSpot').addEventListener('change', function(){ if (this.value) selectSpot(this.value); else selectRegion(st.region); });
  $('list').addEventListener('click', function(e){ var c = e.target.closest('.scard'); if (c) selectSpot(c.dataset.spot); });
  $('place').addEventListener('click', function(e){
    var y = e.target.closest('[data-m]'); if (y){ stopPlay(); setMonth(+y.dataset.m); return; }
    var s = e.target.closest('[data-spot]'); if (s) selectSpot(s.dataset.spot);
  });
  $('btnAll').addEventListener('click', function(){ st.region = 'all'; st.spot = null; fillSelectors(); render({fly:true}); });
  $('btnAbout').addEventListener('click', function(){ openModal('about'); });
  ['btnEtq', 'btnEtq2', 'btnEtq3'].forEach(function(id){ $(id).addEventListener('click', function(){ if (id === 'btnEtq3') closeModal($('about')); openModal('etq'); }); });
  $('btnSet').addEventListener('click', function(){ fillSettings(); openModal('settings'); });
  $('settings').addEventListener('change', saveSettings);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.addEventListener('toggle', saveSecs); });
  $('setOpenAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = true; }); saveSecs(); });
  $('setCloseAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = false; }); saveSecs(); });
  function openAbout(creator){
    if ($('settings').classList.contains('show')) closeModal($('settings'));
    openModal('about'); if (creator) $('creatorBox').scrollIntoView({block:'nearest'});
  }
  $('btnCreator').addEventListener('click', function(){ openAbout(true); });
  document.querySelectorAll('[data-open-about]').forEach(function(b){ b.addEventListener('click', function(){ openAbout(b.dataset.openAbout === 'creator'); }); });
  document.querySelectorAll('[data-open-etq]').forEach(function(b){ b.addEventListener('click', function(){ closeModal($('settings')); openModal('etq'); }); });
  $('sheetBtn').addEventListener('click', function(){ setSheet(!$('panel').classList.contains('min')); });
  document.querySelectorAll('.modal').forEach(function(m){
    m.addEventListener('click', function(e){ if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', function(e){
    var open = document.querySelector('.modal.show');
    if (e.key === 'Escape' && open){ closeModal(open); return; }
    if (open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight'){ stopPlay(); setMonth(st.month + 1); }
    if (e.key === 'ArrowLeft'){ stopPlay(); setMonth(st.month - 1); }
    if (e.key === 'n' || e.key === 'N') setNight(!st.night);
  });
  $('play').addEventListener('click', function(){ if (playT) stopPlay(); else startPlay(); });
}
function setSheet(min){
  $('panel').classList.toggle('min', min); document.body.classList.toggle('sheet-min', min); $('sheetBtn').textContent = min ? '展開清單' : '收合';
  if (window.CampScene) CampScene.resize();
}
var playT = 0, played = 0;
function startPlay(){
  played = 0; $('play').classList.add('on'); $('play').textContent = '❚❚';
  playT = setInterval(function(){ if (++played > 12){ stopPlay(); return; } setMonth(st.month + 1); }, set.play || 1100);
}
function stopPlay(){ if (!playT) return; clearInterval(playT); playT = 0; $('play').classList.remove('on'); $('play').textContent = '▶'; }

/* ---------- 啟動 ---------- */
fillSelectors(); buildEtiquette(); bind(); if (innerWidth <= 760) setSheet(true); render();
CampScene.onPickSpot = function(id){ selectSpot(id); };
function firstVisit(){ if (!lsGet(SEEN_KEY, 0)) openModal('about'); }
CampScene.init({host:$('stage'), labels:$('labels'), reduce:reduceOn(), month:st.month, night:st.night, layer:st.layer}).then(function(){
  CampScene.setLabels(set.labels);
  render({fly:true});
  setTimeout(function(){ $('loading').classList.add('hide'); firstVisit(); }, 250);
}).catch(function(err){
  console.error(err);
  $('loadMsg').textContent = '3D 地圖載入失敗（可能是網路無法連到繪圖元件）';
  $('loadSub').textContent = '營地清單與露營指數仍可使用，點畫面任一處繼續。';
  $('loading').addEventListener('click', function(){ $('loading').classList.add('hide'); firstVisit(); }, {once:true});
});

window.__camp = {state:st, setMonth:setMonth, selectSpot:selectSpot, selectRegion:selectRegion, setNight:setNight, setLayer:setLayer, CM:CM, scene:CampScene};
})();
