/* ================= 台灣露營地圖：3D 場景 =================
 * Three.js（importmap 指到 jsdelivr）。台灣本島與離島輪廓、山脈地形、離岸距離場沿用台灣賞鳥地圖的做法。
 * 陸地 shader：疊上等高線（每 250 公尺一條）；打開「夜溫圖層」時，依當月各地月均溫（反距離加權）
 * 與海拔遞減估算夜間低溫並上色。每個營地放幾頂帳篷、營火、野餐桌與依型態而定的景物（海、溪、湖、森林、果園、熱氣球…），
 * 可切換白天／夜晚：夜晚有星空、帳篷透出燈光、營火搖曳，螢火蟲季的營地有螢火蟲。
 * 座標：x = 東西、z = 南北（北為 -z）、y = 高度；1 單位約 10 公里，山高與景物大小都有誇大。
 * 本檔由 tools/build_scene.py 把賞花地圖 scene.js 的共用段落（地形、標籤、排列、雲、鏡頭、點選）組進來。
 */
(function(){
'use strict';
var S = window.CampScene = {ready:false};
var T, Orbit;
var EXT = {x0:-36, z0:-36, x1:18, z1:28}, RES = .25, FW = 0, FH = 0, FIELD = null;
var U = {time:{value:0}, layer:{value:1}, night:{value:0}, st:null};
var renderer, scene, camera, controls, raycaster, ndc, toonGrad, clock, seaMat, landMat;
var ISL = [], SPOT3 = {}, labels = [], clouds = [], pickables = [], stars = null, flies = null;
var selId = null, fly = null, showLabels = true, curMonth = 1, night = 0, nightTarget = 0, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var host, labelRoot, tmpV, hemi, sun, amb, fireLight;
var TF = {ISLANDS:CM.ISLANDS, SPOTS:CM.SPOTS, PEAKS:CM.PEAKS};   // 共用段落沿用的名稱

function P(lon, lat){ return [(lon - 120.9) * 10.17, -(lat - 23.7) * 11.1]; }
S.proj = P;
function hash(n){ var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T.Color(h); }
function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function noise(x, z){ return .5 * Math.sin(x * 1.9 + z * .7) * Math.sin(z * 1.4 - x * .5) + .3 * Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 + .4) + .2 * Math.sin(x * 8.3 + z * 6.1); }

/* ---------- 幾何：多邊形與距離場 ---------- */
function segD2(x, z, a, b){
  var dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? ((x - a[0]) * dx + (z - a[1]) * dz) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  var px = a[0] + t * dx - x, pz = a[1] + t * dz - z; return px * px + pz * pz;
}
function inPoly(x, z, poly){
  var c = false;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){
    var a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function edgeDist(x, z, poly){
  var m = 1e9;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){ var d = segD2(x, z, poly[j], poly[i]); if (d < m) m = d; }
  return Math.sqrt(m);
}
function sdIsland(x, z, I){ var d = edgeDist(x, z, I.poly); return inPoly(x, z, I.poly) ? -d : d; }
function sdAll(x, z){
  var best = 1e9;
  for (var k = 0; k < ISL.length; k++){
    var bb = ISL[k].bb, bx = Math.max(bb[0] - x, 0, x - bb[2]), bz = Math.max(bb[1] - z, 0, z - bb[3]);
    if (bx * bx + bz * bz > best * best) continue;
    var d = sdIsland(x, z, ISL[k]);
    if (d < best) best = d;
    if (best < 0) return best;
  }
  return best;
}
function field(x, z){
  var fx = (x - EXT.x0) / RES, fz = (z - EXT.z0) / RES;
  if (fx < 0 || fz < 0 || fx >= FW - 1 || fz >= FH - 1) return 12;
  var i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * FW + i;
  return (FIELD[k] * (1 - u) + FIELD[k + 1] * u) * (1 - v) + (FIELD[k + FW] * (1 - u) + FIELD[k + FW + 1] * u) * v;
}
S.field = field;

var HGT = {penghu:.12, baisha:.1, xiyu:.12, kinmen:.26, lieyu:.2, nangan:.38, beigan:.4, dongyin:.3, juguang:.25,
  qimei:.14, wangan:.12, ludao:.34, lanyu:.62, liuqiu:.16, guishan:.55, keelungi:.22};
function buildPolys(){
  TF.ISLANDS.forEach(function(I, k){
    var poly;
    if (I.poly) poly = I.poly.map(function(p){ return P(p[0], p[1]); });
    else {
      var c = P(I.c[0], I.c[1]), r = I.km / 10 * 1.5, sx = I.sx || 1, sy = I.sy || 1;
      poly = [];
      for (var i = 0; i < 24; i++){
        var a = i / 24 * Math.PI * 2, rr = r * (1 + .1 * Math.sin(3 * a + k) + .06 * Math.sin(5 * a + k * 2));
        poly.push([c[0] + Math.cos(a) * rr * sx, c[1] + Math.sin(a) * rr * sy]);
      }
    }
    var bb = [1e9, 1e9, -1e9, -1e9], cx = 0, cz = 0;
    poly.forEach(function(p){ bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); cx += p[0]; cz += p[1]; });
    ISL.push({id:I.id, name:I.name, main:!!I.main, poly:poly, bb:bb, hgt:HGT[I.id] || .2, c:[cx / poly.length, cz / poly.length]});
  });
}
function buildField(){
  FW = Math.ceil((EXT.x1 - EXT.x0) / RES) + 1; FH = Math.ceil((EXT.z1 - EXT.z0) / RES) + 1;
  FIELD = new Float32Array(FW * FH);
  for (var j = 0; j < FH; j++) for (var i = 0; i < FW; i++) FIELD[j * FW + i] = sdAll(EXT.x0 + i * RES, EXT.z0 + j * RES);
  var data = new Uint8Array(FW * FH * 4);
  for (var k = 0; k < FW * FH; k++){ var d = Math.max(0, Math.min(12, FIELD[k])); data[k * 4] = Math.round(d / 12 * 255); data[k * 4 + 3] = 255; }
  var tex = new T.DataTexture(data, FW, FH, T.RGBAFormat);
  tex.magFilter = tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

/* ---------- 地形 ---------- */
var RIDGES = [
  [[121.70,24.80,.6,1.2],[121.45,24.55,2.4,1.8],[121.30,24.30,3.5,2.0],[121.28,24.12,3.4,2.0],[121.22,23.85,3.3,2.1],[121.08,23.50,3.4,2.2],[121.00,23.20,3.0,2.0],[120.88,22.85,2.8,1.8],[120.78,22.55,2.7,1.6],[120.80,22.25,1.4,1.3],[120.83,22.00,.4,.8]],
  [[120.82,23.80,2.0,1.3],[120.957,23.47,3.95,1.3],[120.86,23.15,2.4,1.2]],
  [[121.55,24.72,1.6,1.3],[121.231,24.383,3.9,1.4],[121.02,24.20,2.6,1.3],[120.86,24.00,1.4,1.1]],
  [[121.53,23.78,.9,.6],[121.45,23.45,1.6,.6],[121.35,23.15,1.4,.6],[121.22,22.93,.9,.5]],
  [[121.50,25.20,.6,.6],[121.548,25.171,1.12,.7],[121.62,25.14,.7,.6]],
  [[120.62,23.30,.7,1.0],[120.72,23.65,.9,1.0],[120.80,24.35,.8,1.2]]
];
var KM = .42, RID = [];
function prepRidges(){ RID = RIDGES.map(function(r){ return r.map(function(p){ var q = P(p[0], p[1]); return [q[0], q[1], p[2] * KM, p[3]]; }); }); }
function ridgeH(x, z){
  var best = 0;
  RID.forEach(function(r){
    for (var i = 0; i < r.length - 1; i++){
      var a = r[i], b = r[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
      var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
      var px = a[0] + t * dx - x, pz = a[1] + t * dz - z, d = Math.sqrt(px * px + pz * pz);
      var h = a[2] + (b[2] - a[2]) * t, w = a[3] + (b[3] - a[3]) * t;
      var v = h * Math.exp(-(d / w) * (d / w));
      if (v > best) best = v;
    }
  });
  return best;
}
var LANDC;
function landColor(h, d){
  if (h < -.01) return LANDC.under;
  if (d < .09 || h < .058) return LANDC.sand;
  if (h < .3) return LANDC.plain;
  if (h < .65) return LANDC.grass;
  if (h < 1.05) return LANDC.forest;
  if (h < 1.45) return LANDC.deep;
  if (h < 1.72) return LANDC.rock;
  return LANDC.peak;
}
function hAt(I, x, z, d){
  if (d <= 0) return Math.max(-.62, d * .9);
  var n = noise(x, z);
  if (I.main) return .05 + ridgeH(x, z) * smooth(0, 1.1, d) * (1 + .28 * n) + .03 * smooth(0, .5, d) * (n + 1);
  return .04 + I.hgt * smooth(0, Math.min(I.bb[2] - I.bb[0], I.bb[3] - I.bb[1]) * .4, d) * (1 + .2 * n);
}
function buildLand(I){
  var m = I.main ? 1.1 : .8, w = I.bb[2] - I.bb[0], res = I.main ? .12 : (w < 1 ? .05 : .08);
  var x0 = I.bb[0] - m, z0 = I.bb[1] - m, nx = Math.ceil((w + 2 * m) / res) + 1, nz = Math.ceil((I.bb[3] - I.bb[1] + 2 * m) / res) + 1;
  var pos = new Float32Array(nx * nz * 3), cols = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++){
    var x = x0 + i * res, z = z0 + j * res, d = -sdIsland(x, z, I), k = j * nx + i, h = hAt(I, x, z, d);
    hs[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    var c = landColor(h, d); cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  var idx = [];
  for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++){
    var a = j * nx + i, b = a + 1, c2 = a + nx, d2 = c2 + 1;
    if (hs[a] > -.6 || hs[b] > -.6 || hs[c2] > -.6 || hs[d2] > -.6) idx.push(a, c2, b, b, c2, d2);
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new T.Mesh(g, landMat));
}
function landY(x, z){
  var best = null, bd = 1e9;
  ISL.forEach(function(I){ var d = sdIsland(x, z, I); if (d < bd){ bd = d; best = I; } });
  if (!best || bd > 0) return .05;
  return Math.max(.04, hAt(best, x, z, -bd));
}
S.landY = landY;

/* ---------- 等高線＋夜溫圖層 ---------- */
var NST = CM.STATIONS.length;
function tempPatch(mat){
  mat.onBeforeCompile = function(sh){
    sh.uniforms.uSt = {value:U.st}; sh.uniforms.uLayer = U.layer; sh.uniforms.uNight = U.night;
    sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = '#define NST ' + NST + '\nuniform vec3 uSt[NST]; uniform float uLayer, uNight; varying vec3 vP;\n' +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + [
      'float hk = max(0., vP.y) / ' + KM.toFixed(3) + ';',
      'float land = smoothstep(.03, .07, vP.y);',
      'float s = 0., w = 0.;',
      'for (int i = 0; i < NST; i++){ vec2 d = (vP.xz - uSt[i].xy) * 10.; float d2 = dot(d, d) + 25.; float k = 1. / (d2 * d2); s += uSt[i].z * k; w += k; }',
      'float tn = s / w - ' + CM.LAPSE.toFixed(2) + ' * hk * 10. - 4. - step(.8, hk) * .5;',
      'vec3 tc = vec3(.42, .3, .66);',
      'tc = mix(tc, vec3(.33, .55, .86), smoothstep(-1., 1., tn));',
      'tc = mix(tc, vec3(.45, .78, .86), smoothstep(3., 5., tn));',
      'tc = mix(tc, vec3(.42, .76, .42), smoothstep(7., 9., tn));',
      'tc = mix(tc, vec3(.93, .82, .32), smoothstep(21., 23., tn));',
      'tc = mix(tc, vec3(.9, .45, .25), smoothstep(23.5, 25., tn));',
      'vec3 c = diffuseColor.rgb;',
      'c = mix(c, tc, uLayer * land * .62);',
      // 等高線：每 250 公尺一條，每 1000 公尺加粗
      'float cl = hk * 4.; float fw = fwidth(cl) + 1e-4;',
      'float ln = 1. - smoothstep(0., fw * 1.3, abs(fract(cl - .5) - .5));',
      'float cl2 = hk; float fw2 = fwidth(cl2) + 1e-4;',
      'float ln2 = 1. - smoothstep(0., fw2 * 2.2, abs(fract(cl2 - .5) - .5));',
      'float show = land * step(.12, hk) * (1. - smoothstep(.12, .35, fw));',
      'c = mix(c, c * .62, max(ln * .55, ln2) * show);',
      'diffuseColor.rgb = c;'].join('\n'));
  };
  mat.customProgramCacheKey = function(){ return 'camptemp' + NST; };
  return mat;
}

/* ---------- 海 ---------- */
var SEA_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
var SEA_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform float uTime, uCalm, uNight; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw;',
  '  float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.6,.86,.8), vec3(.3,.66,.72), smoothstep(.1, 1.2, d));',
  '  col = mix(col, vec3(.14,.44,.58), smoothstep(1., 3., d));',
  '  col = mix(col, vec3(.08,.3,.47), smoothstep(3., 9., d));',
  // 等深線（呼應地形圖）
  '  float ib = 1. - smoothstep(0., .04, abs(fract(d * .5 - .5) - .5));',
  '  col = mix(col, col * 1.15, ib * .35 * smoothstep(.5, 1., d));',
  '  float t = uTime * uCalm;',
  '  float f = 1. - smoothstep(.04, .14 + .04 * sin(t*2. + vW.x*5. + vW.z*3.), d);',
  '  col = mix(col, vec3(1.), f * .85);',
  '  col = mix(col, col * vec3(.18, .22, .36), uNight);',
  '  float alpha = mix(.55, .85, smoothstep(0., 4., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz));',
  '  col = mix(col, uHorizon, hz); alpha = mix(alpha, 1., hz);',
  '  gl_FragColor = vec4(col, alpha);',
  '}'].join('\n');
var BED_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform vec3 uHorizon; uniform float uNight; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw; float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.6,.8,.68), vec3(.18,.46,.52), smoothstep(.2, 1.6, d));',
  '  col = mix(col, vec3(.04,.16,.3), smoothstep(2., 6., d));',
  '  col = mix(col, col * .25, uNight);',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz)); col = mix(col, uHorizon, hz);',
  '  gl_FragColor = vec4(col, 1.);',
  '}'].join('\n');
function buildSea(tex){
  var uni = {uDist:{value:tex}, uExt:{value:new T.Vector4(EXT.x0, EXT.z0, (FW - 1) * RES, (FH - 1) * RES)},
    uTime:U.time, uNight:U.night, uCalm:{value:reduce ? .15 : 1}, uHorizon:{value:new T.Vector3(.9, .88, .8)}};
  seaMat = new T.ShaderMaterial({uniforms:uni, vertexShader:SEA_VS, fragmentShader:SEA_FS, transparent:true});
  var sea = new T.Mesh(new T.PlaneGeometry(520, 520), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(-8, 0, -4); sea.renderOrder = 2; scene.add(sea);
  var bed = new T.Mesh(new T.PlaneGeometry(520, 520), new T.ShaderMaterial({uniforms:{uDist:uni.uDist, uExt:uni.uExt, uHorizon:uni.uHorizon, uNight:U.night}, vertexShader:SEA_VS, fragmentShader:BED_FS}));
  bed.rotation.x = -Math.PI / 2; bed.position.set(-8, -.62, -4); scene.add(bed);
}

/* ---------- 營地景物 ---------- */
var MC = {}, GC = {};
function M(c){ return MC[c] || (MC[c] = new T.MeshToonMaterial({color:c, gradientMap:toonGrad})); }
function box(w, h, d){ var k = 'b' + w + '_' + h + '_' + d; return GC[k] || (GC[k] = new T.BoxGeometry(w, h, d)); }
function cyl(r0, r1, h, n){ var k = 'c' + r0 + '_' + r1 + '_' + h + '_' + (n || 8); return GC[k] || (GC[k] = new T.CylinderGeometry(r0, r1, h, n || 8)); }
function cone(r, h, n){ var k = 'k' + r + '_' + h + '_' + (n || 7); return GC[k] || (GC[k] = new T.ConeGeometry(r, h, n || 7)); }
function ball(r, d){ var k = 's' + r + '_' + (d || 1); return GC[k] || (GC[k] = new T.IcosahedronGeometry(r, d || 1)); }
function mesh(g, c, x, y, z, ry){ var m = new T.Mesh(g, typeof c === 'string' ? M(c) : c); m.position.set(x || 0, y || 0, z || 0); if (ry) m.rotation.y = ry; return m; }
function flat(w, d, c, x, z, y){ var k = 'p' + w + '_' + d, g = GC[k] || (GC[k] = new T.PlaneGeometry(w, d)); var m = new T.Mesh(g, M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .006, z || 0); return m; }
function disc(r, c, x, z, y){ var g = GC['d' + r] || (GC['d' + r] = new T.CircleGeometry(r, 28)); var m = new T.Mesh(g, M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .006, z || 0); return m; }
var WATER = '#5fb7c9', WOOD = '#7a5236', PINE = '#2f6b45';
var TENT_C = ['#e0662b', '#f2b134', '#3f8fbf', '#d64545', '#6aa84f', '#8e6cc0'];
var GLOW = [];       // 夜晚會發光的材質
function glowMat(c){ var m = new T.MeshToonMaterial({color:c, gradientMap:toonGrad, emissive:new T.Color(c), emissiveIntensity:0}); GLOW.push(m); return m; }
var TENT_G = null, DOME_G = null;
function tentGeo(){
  if (TENT_G) return TENT_G;
  var g = new T.CylinderGeometry(.045, .045, .09, 3, 1); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 6); g.translate(0, .022, 0); g.scale(1, 1.15, 1);
  return (TENT_G = g);
}
function domeGeo(){ return DOME_G || (DOME_G = new T.SphereGeometry(.045, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)); }
var TENT_MAT = {};
function tentMat(c){ return TENT_MAT[c] || (TENT_MAT[c] = glowMat(c)); }
function tent(i){
  var c = TENT_C[i % TENT_C.length], m = new T.Mesh(i % 2 ? domeGeo() : tentGeo(), tentMat(c));
  if (i % 2) m.scale.set(1, .85, 1.15);
  return m;
}
var FLAME = null;
function campfire(){
  var g = new T.Group();
  [0, 1.1, 2.2].forEach(function(a){ var l = mesh(cyl(.004, .004, .045, 5), WOOD, 0, .006); l.rotation.z = Math.PI / 2; l.rotation.y = a; g.add(l); });
  for (var i = 0; i < 6; i++){ var a = i / 6 * Math.PI * 2; g.add(mesh(ball(.006, 0), '#8d877c', Math.cos(a) * .028, .004, Math.sin(a) * .028)); }
  if (!FLAME) FLAME = new T.MeshBasicMaterial({color:'#ffb347', transparent:true, opacity:.95});
  var f = new T.Mesh(cone(.012, .04, 6), FLAME); f.position.y = .025; g.add(f);
  var f2 = new T.Mesh(cone(.007, .028, 6), new T.MeshBasicMaterial({color:'#fff1a8'})); f2.position.y = .02; g.add(f2);
  g.userData.flame = [f, f2];
  return g;
}
function table(){
  var g = new T.Group();
  g.add(mesh(box(.06, .006, .03), WOOD, 0, .022));
  [-1, 1].forEach(function(s){ g.add(mesh(box(.06, .004, .01), WOOD, 0, .012, s * .026)); g.add(mesh(box(.004, .022, .03), WOOD, s * .025, .011)); });
  return g;
}
function lantern(){
  var g = new T.Group();
  g.add(mesh(cyl(.002, .002, .07, 4), '#3a3a3a', 0, .035));
  var b = new T.Mesh(ball(.008, 0), glowMat('#ffe08a')); b.position.y = .072; g.add(b);
  return g;
}
function pine(s){ var g = new T.Group(); s = s || 1; g.add(mesh(cyl(.004 * s, .006 * s, .03 * s, 5), WOOD, 0, .015 * s)); g.add(mesh(cone(.035 * s, .08 * s), PINE, 0, .06 * s)); g.add(mesh(cone(.025 * s, .06 * s), '#3d7d52', 0, .09 * s)); return g; }
function leafy(s, c){ var g = new T.Group(); s = s || 1; g.add(mesh(cyl(.005 * s, .007 * s, .05 * s, 5), WOOD, 0, .025 * s)); g.add(mesh(ball(.035 * s), c || '#4f9a4a', 0, .07 * s)); return g; }
function cabin(){ var g = new T.Group(); g.add(mesh(box(.07, .045, .055), '#b07a4a', 0, .0225)); var r = mesh(cyl(0, .06, .04, 4), '#6b3f25', 0, .065); r.rotation.y = Math.PI / 4; r.scale.z = .85; g.add(r); return g; }
function balloon(){
  var g = new T.Group(), b = new T.Mesh(ball(.06, 2), M('#e8503a'));
  b.scale.y = 1.15; b.position.y = .32; g.add(b);
  var band = mesh(cyl(.061, .05, .03, 16), '#f6c343', 0, .29); g.add(band);
  g.add(mesh(box(.025, .02, .025), WOOD, 0, .2));
  g.userData.balloon = b;
  return g;
}
/* 依營地型態加周邊景物 */
function scenery(p, g){
  var t = p.type;
  if (t === 'sea'){ g.add(flat(.9, .25, '#ead8a4', 0, .3, .005)); }
  if (t === 'river'){ var r = flat(1.0, .1, WATER, 0, .28, .008); r.rotation.z = .3; g.add(r); for (var i = 0; i < 6; i++) g.add(mesh(ball(.012, 0), '#9a958a', -.3 + i * .12, .006, .24 + hash(i) * .06)); }
  if (t === 'lake'){ g.add(disc(.26, WATER, .05, .32, .008)); }
  if (t === 'forest' || t === 'high' || t === 'river' || t === 'lake'){
    var n = t === 'forest' ? 14 : 9;
    for (i = 0; i < n; i++){ var a = i / n * Math.PI * 2 + .3, rr = .3 + hash(i * 3.1 + p.id.length) * .16; if (Math.sin(a) > .55) rr += .12; if ((t === 'lake' || t === 'river') && Math.sin(a) > .3) continue; var tr = t === 'high' || t === 'forest' ? pine(.75 + hash(i) * .35) : leafy(.8 + hash(i) * .3); tr.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); g.add(tr); }
  }
  if (t === 'grass'){ for (i = 0; i < 5; i++){ var lf = leafy(.9); var a2 = i * 1.4 + 1; lf.position.set(Math.cos(a2) * .36, 0, Math.sin(a2) * .36); g.add(lf); } }
  if (p.lm === 'apple'){ for (i = 0; i < 6; i++){ var ap = leafy(.8, '#5c9a3e'); ap.position.set(-.3 + i * .1, 0, -.3); g.add(ap); g.add(mesh(ball(.008, 0), '#d8342c', -.3 + i * .1 + .02, .06, -.28)); } }
  if (p.lm === 'cabins'){ [-.25, -.12, .01].forEach(function(x, k){ var c = cabin(); c.position.set(x, 0, -.27); c.rotation.y = .2; g.add(c); }); }
  if (p.lm === 'farm'){ var c2 = cabin(); c2.position.set(.26, 0, -.18); g.add(c2); }
  if (p.lm === 'dam'){ var dm = mesh(box(.32, .05, .03), '#b8b2a5', .05, .025, .14); g.add(dm); }
  if (p.lm === 'balloon'){ var bl = balloon(); bl.position.set(.2, 0, -.2); g.add(bl); g.userData.balloon = bl; }
  if (p.lm === 'stream'){ /* 溪畔已有溪流 */ }
}
function buildCamp(p, i){
  var g = new T.Group(), n = 3 + (i % 3), tents = [];
  for (var k = 0; k < n; k++){
    var a = k / n * Math.PI * 1.6 - .5 + hash(i) * .5, r = .12 + hash(k * 2.3 + i) * .05;
    var t = tent(k + i); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - .04); t.rotation.y = -a + Math.PI / 2; g.add(t); tents.push(t);
  }
  var f = campfire(); f.position.set(0, 0, -.02); g.add(f);
  var tb = table(); tb.position.set(.08, 0, -.13); tb.rotation.y = .4; g.add(tb);
  var ln = lantern(); ln.position.set(-.1, 0, -.12); g.add(ln);
  scenery(p, g);
  g.userData.fire = f; g.userData.tents = tents;
  return g;
}

/* ---------- 標籤 ---------- */
function addLabel(el, pos, pri, kind, extra){
  el.classList.add('lab3d', 'off');
  labelRoot.appendChild(el);
  var L = Object.assign({el:el, pos:pos, pri:pri, kind:kind, w:0, h:0, active:true, off:true}, extra || {});
  labels.push(L);
  return L;
}
function layoutLabels(){
  var W = host.clientWidth, H = host.clientHeight, placed = [];
  var sorted = labels.slice().sort(function(a, b){ return (b.pri + (b.boost || 0)) - (a.pri + (a.boost || 0)); });
  for (var i = 0; i < sorted.length; i++){
    var L = sorted[i];
    if (!L.active || (L.kind === 'spot' && !showLabels && !L.boost)){ hide(L); continue; }
    tmpV.copy(L.pos).project(camera);
    if (tmpV.z > 1 || tmpV.z < -1){ hide(L); continue; }
    var x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
    if (!L.w){ L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    var r = [x - L.w / 2, y - L.h, x + L.w / 2, y];
    if (r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H){ hide(L); continue; }
    var hit = false;
    if (L.kind !== 'sea') for (var k = 0; k < placed.length; k++){ var q = placed[k]; if (r[0] < q[2] + 2 && r[2] > q[0] - 2 && r[1] < q[3] + 1 && r[3] > q[1] - 1){ hit = true; break; } }
    if (hit){ hide(L); continue; }
    if (L.kind !== 'sea') placed.push(r);
    L.el.style.transform = 'translate(' + Math.round(r[0]) + 'px,' + Math.round(r[1]) + 'px)';
    if (L.off){ L.el.classList.remove('off'); L.off = false; }
  }
  function hide(L){ if (!L.off){ L.el.classList.add('off'); L.off = true; } }
}

/* ---------- 營地排列 ---------- */
function onLand(x, z){
  if (field(x, z) < -.15) return [x, z];
  for (var r = .05; r < 2; r += .05) for (var a = 0; a < 16; a++){
    var px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (field(px, pz) < -.18) return [px, pz];
  }
  return [x, z];
}
function layoutSpots(){
  var pos = TF.SPOTS.map(function(p){ return P(p.at[0], p.at[1]); }), used = [], groups = [];
  TF.SPOTS.forEach(function(p, i){
    if (used[i]) return;
    var g = [i]; used[i] = 1;
    for (var k = i + 1; k < pos.length; k++) if (!used[k] && g.some(function(m){ return Math.hypot(pos[m][0] - pos[k][0], pos[m][1] - pos[k][1]) < .7; })){ g.push(k); used[k] = 1; }
    groups.push(g);
  });
  var out = [];
  groups.forEach(function(g){
    if (g.length === 1){ out[g[0]] = onLand(pos[g[0]][0], pos[g[0]][1]); return; }
    var cx = 0, cz = 0; g.forEach(function(m){ cx += pos[m][0]; cz += pos[m][1]; }); cx /= g.length; cz /= g.length;
    var R = .42 + g.length * .07;
    var ang = g.map(function(m){ return {m:m, a:Math.atan2(pos[m][1] - cz, pos[m][0] - cx)}; }).sort(function(p, q){ return p.a - q.a; });
    ang.forEach(function(o, i){
      var a = ang[0].a + i / ang.length * Math.PI * 2;
      out[o.m] = onLand(cx + Math.cos(a) * R, cz + Math.sin(a) * R);
    });
  });
  return out;
}

function buildSpots(){
  var places = layoutSpots();
  CM.SPOTS.forEach(function(p, i){
    var x = places[i][0], z = places[i][1], y = landY(x, z), grp = buildCamp(p, i), K = 1.5;
    grp.position.set(x, y, z); grp.scale.setScalar(K);
    grp.children.forEach(function(o){ o.position.y += (landY(x + o.position.x * K, z + o.position.z * K) - y) / K; });
    grp.traverse(function(o){ if (o.isMesh){ o.userData.spotId = p.id; pickables.push(o); } });
    scene.add(grp);
    var el = document.createElement('button'); el.type = 'button'; el.className = 'plab'; el.dataset.spot = p.id;
    el.innerHTML = '<i></i>' + p.name.replace(/（.*）/, '').replace(/露營區|露營場|露營渡假基地/, '');
    el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickSpot) S.onPickSpot(p.id); });
    SPOT3[p.id] = {id:p.id, idx:i, x:x, y:y, z:z, grp:grp, label:addLabel(el, new T.Vector3(x, y + .45, z), 3, 'spot')};
  });
}
S.spot3 = function(id){ return SPOT3[id]; };
function applyMonth(){
  CM.STATIONS.forEach(function(st, i){ var q = P(st.at[0], st.at[1]); U.st[i].set(q[0], q[1], st.t[curMonth - 1]); });
  CM.SPOTS.forEach(function(p){
    var S3 = SPOT3[p.id], c = CM.climate(p, curMonth), sc = CM.SCORES[c.score];
    S3.label.el.querySelector('i').style.background = sc.c;
    S3.label.el.dataset.score = c.score;
    S3.label.pri = 2 + c.score * .4;
  });
  buildFlies();
}

/* ---------- 星空與螢火蟲 ---------- */
function dotTex(soft){
  var c = document.createElement('canvas'); c.width = c.height = 32;
  var x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft ? .25 : .4, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new T.CanvasTexture(c);
}
function buildStars(){
  var n = 1600, pos = new Float32Array(n * 3);
  for (var i = 0; i < n; i++){
    var u = hash(i * 1.7), v = hash(i * 3.3 + 1), th = u * Math.PI * 2, ph = Math.acos(1 - v * .95), r = 380;
    pos[i * 3] = Math.cos(th) * Math.sin(ph) * r; pos[i * 3 + 1] = Math.cos(ph) * r * .6 + 10; pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
  }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
  stars = new T.Points(g, new T.PointsMaterial({size:2.2, map:dotTex(), transparent:true, opacity:0, depthWrite:false, sizeAttenuation:false, color:'#fff8e0', fog:false}));
  stars.frustumCulled = false; scene.add(stars);
}
var FLY_N = 0, FLY_BASE = null;
function buildFlies(){
  if (flies){ scene.remove(flies); flies.geometry.dispose(); flies = null; }
  var src = [];
  CM.SPOTS.forEach(function(p){ if (p.hl.some(function(h){ return h.months[curMonth] && /螢火蟲/.test(h[2]); })) src.push(SPOT3[p.id]); });
  if (!src.length){ FLY_N = 0; return; }
  FLY_N = src.length * 60;
  var pos = new Float32Array(FLY_N * 3); FLY_BASE = new Float32Array(FLY_N * 4);
  src.forEach(function(S3, k){
    for (var i = 0; i < 60; i++){
      var j = k * 60 + i, a = hash(j * 1.3) * 6.28, r = .15 + hash(j * 2.1) * .35;
      FLY_BASE[j * 4] = S3.x + Math.cos(a) * r * 1.5; FLY_BASE[j * 4 + 1] = S3.y + .03 + hash(j * 4.4) * .1; FLY_BASE[j * 4 + 2] = S3.z + Math.sin(a) * r * 1.5; FLY_BASE[j * 4 + 3] = hash(j * 7.7) * 6.28;
    }
  });
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
  flies = new T.Points(g, new T.PointsMaterial({size:.035, map:dotTex(true), transparent:true, opacity:0, depthWrite:false, color:'#d8ff6a', blending:T.AdditiveBlending}));
  flies.frustumCulled = false; scene.add(flies);
}
function updateFlies(t){
  if (!flies) return;
  var pos = flies.geometry.attributes.position.array, k = reduce ? .3 : 1;
  for (var i = 0; i < FLY_N; i++){
    var ph = FLY_BASE[i * 4 + 3], b = FLY_BASE;
    pos[i * 3] = b[i * 4] + Math.sin(t * .7 * k + ph) * .03; pos[i * 3 + 1] = b[i * 4 + 1] + Math.sin(t * 1.1 * k + ph * 2) * .015; pos[i * 3 + 2] = b[i * 4 + 2] + Math.cos(t * .6 * k + ph) * .03;
  }
  flies.geometry.attributes.position.needsUpdate = true;
  flies.material.opacity = night * (.55 + .45 * Math.sin(t * 3.1));
}

/* ---------- 雲 ---------- */
function cloud(seed){
  var g = new T.Group(), m = new T.MeshToonMaterial({color:'#ffffff', gradientMap:toonGrad, transparent:true, opacity:.95});
  var n = 4 + (seed % 3);
  for (var i = 0; i < n; i++){
    var r = .9 + hash(seed * 7 + i) * .9, s = new T.Mesh(new T.SphereGeometry(r, 12, 9), m);
    s.position.set((i - n / 2) * 1.1 + hash(seed + i) * .6, hash(seed * 3 + i) * .5, (hash(seed * 5 + i) - .5) * 1.4);
    s.scale.y = .62; g.add(s);
  }
  return g;
}

/* ---------- 鏡頭 ---------- */
S.flyTo = function(x, z, dist, polar, dur, y){
  var off = camera.position.clone().sub(controls.target), sph = new T.Spherical().setFromVector3(off);
  var to = new T.Spherical(dist, polar === undefined ? .9 : polar, sph.theta);
  var endT = new T.Vector3(x, y || 0, z), endP = new T.Vector3().setFromSpherical(to).add(endT);
  fly = {t0:clock.elapsedTime, dur:reduce ? .01 : (dur || 1.3), fromT:controls.target.clone(), toT:endT, fromP:camera.position.clone(), toP:endP};
};
function aspectK(){ var a = host.clientWidth / Math.max(1, host.clientHeight); return a < .8 ? 1.45 : 1; }
S.overview = function(){
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(-6, 0, a < .8 ? 100 : a < 1.2 ? 80 : 66, .6);
};
S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  S.flyTo(S3.x, S3.z, (S3.y > .4 ? 5.6 : 5) * aspectK(), .9, 1.3, S3.y * .8);
};
S.focusRegion = function(ids){
  var xs = [], zs = [];
  ids.forEach(function(id){ var S3 = SPOT3[id]; if (S3){ xs.push(S3.x); zs.push(S3.z); } });
  if (!xs.length) return;
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  S.flyTo((x0 + x1) / 2, (z0 + z1) / 2, Math.max(9, Math.max(x1 - x0, z1 - z0) * 1.5 + 6) * aspectK(), .8);
};

S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  S.flyTo(S3.x, S3.z, 2.6 * aspectK(), .95, 1.3, S3.y * .9);
};
/* ---------- 對外 ---------- */
S.setMonth = function(m){ curMonth = m; if (S.ready) applyMonth(); };
S.selectSpot = function(id){
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.remove('on'); SPOT3[selId].label.boost = 0; SPOT3[selId].label.w = 0; }
  selId = id || null;
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.add('on'); SPOT3[selId].label.boost = 10; SPOT3[selId].label.w = 0; }
};
S.setLabels = function(on){ showLabels = !!on; };
S.setReduce = function(on){ reduce = !!on; if (seaMat) seaMat.uniforms.uCalm.value = reduce ? .15 : 1; };
S.setLayer = function(on){ U.layer.value = on ? 1 : 0; };
S.setNight = function(on, instant){ nightTarget = on ? 1 : 0; if (instant || reduce) night = nightTarget; };
S.resize = function(){ if (S.ready) resize(); };
S.setHorizon = function(c){ if (seaMat) seaMat.uniforms.uHorizon.value.set(c[0], c[1], c[2]); };

/* ---------- 互動 ---------- */
function pick(ev){
  var r = renderer.domElement.getBoundingClientRect();
  ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData : null;
}
function bindPointer(){
  var el = renderer.domElement, down = null, q = null, pending = false;
  el.addEventListener('pointerdown', function(e){ down = {x:e.clientX, y:e.clientY}; });
  el.addEventListener('pointerup', function(e){
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    var u = pick(e); if (u && u.spotId && S.onPickSpot) S.onPickSpot(u.spotId);
  });
  el.addEventListener('pointermove', function(e){
    if (e.pointerType !== 'mouse') return;
    q = e; if (pending) return; pending = true;
    requestAnimationFrame(function(){ pending = false; el.style.cursor = pick(q) ? 'pointer' : ''; });
  });
}

/* ---------- 迴圈 ---------- */
function resize(){
  var w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
  if (w > 760) camera.setViewOffset(w, h, Math.min(190, w * .13), 0, w, h);
  else camera.setViewOffset(w, h, 0, document.body.classList.contains('sheet-min') ? -h * .09 : h * .1, w, h);
  camera.updateProjectionMatrix();
  labels.forEach(function(L){ L.w = 0; });
}
var DAY = {hemi:['#fff6ea', '#9fcf8a', 1.5], sun:['#fff1dc', 2.4], amb:.35}, NIGHT = {hemi:['#6f7fb8', '#1d2a3a', .55], sun:['#9fb4ff', .35], amb:.12};
function applyNight(t){
  U.night.value = night;
  hemi.color.set(DAY.hemi[0]).lerp(tmpC.set(NIGHT.hemi[0]), night); hemi.groundColor.set(DAY.hemi[1]).lerp(tmpC.set(NIGHT.hemi[1]), night);
  hemi.intensity = DAY.hemi[2] + (NIGHT.hemi[2] - DAY.hemi[2]) * night;
  sun.color.set(DAY.sun[0]).lerp(tmpC.set(NIGHT.sun[0]), night); sun.intensity = DAY.sun[1] + (NIGHT.sun[1] - DAY.sun[1]) * night;
  amb.intensity = DAY.amb + (NIGHT.amb - DAY.amb) * night;
  GLOW.forEach(function(m){ m.emissiveIntensity = night * .75; });
  if (stars) stars.material.opacity = night;
  var fl = .85 + .15 * Math.sin(t * 13) * Math.sin(t * 7.3);
  if (FLAME){ FLAME.color.setHSL(.08 + .02 * Math.sin(t * 9), 1, .6); }
  var S3 = selId && SPOT3[selId];
  if (S3){ fireLight.position.set(S3.x, S3.y + .1, S3.z - .03); fireLight.intensity = night * .5 * fl; } else fireLight.intensity = 0;
  clouds.forEach(function(C){ C.g.children.forEach(function(s){ s.material.opacity = .95 - night * .6; }); });
}
var tmpC;
function loop(){
  requestAnimationFrame(loop);
  var dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t;
  if (night !== nightTarget){ night += Math.sign(nightTarget - night) * Math.min(Math.abs(nightTarget - night), dt * 1.2); }
  applyNight(t);
  if (fly){
    var k = Math.min(1, (t - fly.t0) / fly.dur), e = ease(k);
    controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  if (!reduce) CM.SPOTS.forEach(function(p){
    var g = SPOT3[p.id].grp, f = g.userData.fire;
    if (f) f.userData.flame.forEach(function(m, i){ m.scale.y = 1 + .25 * Math.sin(t * (11 + i * 3) + p.elev); });
    if (g.userData.balloon) g.userData.balloon.position.y = .04 * Math.sin(t * .6);
  });
  updateFlies(t);
  clouds.forEach(function(C){ C.g.position.x += dt * C.v * (reduce ? .3 : 1); if (C.g.position.x > EXT.x1 + 20) C.g.position.x = EXT.x0 - 20; });
  renderer.render(scene, camera);
  layoutLabels();
}

/* ---------- 啟動 ---------- */
S.init = function(opts){
  host = opts.host; labelRoot = opts.labels;
  if (opts.reduce !== undefined) reduce = opts.reduce;
  if (opts.month) curMonth = opts.month;
  if (opts.night){ night = nightTarget = 1; }
  if (opts.layer !== undefined) U.layer.value = opts.layer ? 1 : 0;
  return Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function(mods){
    T = mods[0]; Orbit = mods[1].OrbitControls; tmpV = new T.Vector3(); tmpC = new T.Color();
    clock = new T.Clock();
    U.st = CM.STATIONS.map(function(){ return new T.Vector3(); });
    LANDC = {under:col('#9fd3bf'), sand:col('#efe0b0'), plain:col('#b5d98a'), grass:col('#8cc46b'), forest:col('#5f9f5c'), deep:col('#477f52'), rock:col('#98a08c'), peak:col('#cfd2c4')};
    renderer = new T.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(42, 1, .03, 900);
    camera.position.set(-6, 44, 34);
    controls = new Orbit(camera, renderer.domElement);
    controls.target.set(-6, 0, -3);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.maxPolarAngle = 1.3; controls.minDistance = 1; controls.maxDistance = 140;
    controls.screenSpacePanning = false; controls.zoomSpeed = .9;
    controls.addEventListener('start', function(){ fly = null; });
    raycaster = new T.Raycaster(); ndc = new T.Vector2();
    toonGrad = new T.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, T.RedFormat);
    toonGrad.minFilter = toonGrad.magFilter = T.NearestFilter; toonGrad.needsUpdate = true;
    landMat = tempPatch(new T.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad}));
    hemi = new T.HemisphereLight('#fff6ea', '#9fcf8a', 1.5); scene.add(hemi);
    sun = new T.DirectionalLight('#fff1dc', 2.4); sun.position.set(-20, 40, 18); scene.add(sun);
    amb = new T.AmbientLight('#ffffff', .35); scene.add(amb);
    fireLight = new T.PointLight('#ff9a3c', 0, .4, 2); scene.add(fireLight);

    buildPolys(); prepRidges();
    var tex = buildField();
    buildSea(tex);
    ISL.forEach(buildLand);
    buildSpots(); buildStars();

    ISL.forEach(function(I){
      if (!I.name) return;
      var el = document.createElement('div'); el.className = I.main ? 'ilab main' : 'ilab'; el.textContent = I.name;
      var at = I.main ? new T.Vector3(1.5, 2.6, -2) : new T.Vector3(I.c[0], .5, I.c[1] - .2);
      addLabel(el, at, I.main ? 5 : 2, 'isle');
    });
    CM.PEAKS.forEach(function(pk){
      var q = P(pk.at[0], pk.at[1]), el = document.createElement('div'); el.className = 'pk';
      el.textContent = '▲ ' + pk.name + ' ' + pk.m.toLocaleString() + 'm';
      addLabel(el, new T.Vector3(q[0], landY(q[0], q[1]) + .25, q[1]), 1, 'peak');
    });
    [['台灣海峽', 119.6, 24.25], ['太平洋', 122.6, 23.3], ['巴士海峽', 120.6, 21.3]].forEach(function(s){
      var q = P(s[1], s[2]), el = document.createElement('div'); el.className = 'sealab'; el.textContent = s[0];
      addLabel(el, new T.Vector3(q[0], .1, q[1]), 0, 'sea');
    });
    for (var i = 0; i < 6; i++){
      var c = cloud(i + 1); c.position.set(EXT.x0 + hash(i * 3.3) * (EXT.x1 - EXT.x0 + 20), 13 + hash(i * 1.9) * 3, EXT.z0 + hash(i * 4.7) * (EXT.z1 - EXT.z0));
      c.scale.setScalar(.6 + hash(i * 2.2) * .5); scene.add(c); clouds.push({g:c, v:.25 + hash(i) * .3});
    }

    bindPointer();
    window.addEventListener('resize', resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    S.ready = true;
    applyMonth();
    S.overview(); fly.dur = .01;
    loop();
  });
};
S.stats = function(){
  return {spots:Object.keys(SPOT3).length, islands:ISL.length, labels:labels.length, visibleLabels:labels.filter(function(L){ return !L.off; }).length,
    month:curMonth, night:+night.toFixed(2), fireflies:FLY_N, layer:U.layer.value};
};
})();
