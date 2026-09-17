/*
 * bloub-engine.js — a plain-JavaScript port of the bot engine from
 * https://github.com/jeremy-prt/bloub (MIT License, Copyright (c) 2026 Jérémy Perret).
 * Shapes, eye model, states, expressions and timings are bloub's measurements of the
 * x.ai bot video; this file only translates src/bot/*.ts to browser JS and adds a
 * Canvas renderer. Not affiliated with x.ai.
 */
window.Bloub = (() => {
  // ---------------------------------------------------------------- math.ts
  const TAU = Math.PI * 2;
  const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easings = {
    easeOutCubic: t => 1 - (1 - t) ** 3,
    easeInOutCubic: t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    easeOutQuint: t => 1 - (1 - t) ** 5
  };
  function loopNoise(t, period, seed = 0) { const p = (t / period) * TAU; return 0.55 * Math.sin(p + seed) + 0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) + 0.15 * Math.sin(3 * p + seed * 2.3 + 2.4); }
  function createRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const r2 = v => Math.round(v * 100) / 100;

  // ------------------------------------------------------------ profiles.ts (measured off the video, 64 radii, theta = 0 right, clockwise)
  const PROFILE_SAMPLES = 64;
  const PROFILES = {
    egg: [0.8369,0.8424,0.8497,0.8585,0.8674,0.8775,0.8878,0.8983,0.9089,0.9185,0.9288,0.9374,0.9445,0.9504,0.9543,0.9559,0.9555,0.9519,0.9466,0.9389,0.9302,0.9193,0.9085,0.8969,0.8852,0.8734,0.8625,0.8513,0.8411,0.8325,0.8243,0.8179,0.8137,0.8112,0.8102,0.8128,0.8178,0.8262,0.8374,0.8518,0.8702,0.8922,0.9169,0.9446,0.9741,1.0023,1.0267,1.0433,1.0481,1.0393,1.0216,0.9970,0.9697,0.9418,0.9169,0.8949,0.8760,0.8604,0.8490,0.8394,0.8337,0.8314,0.8305,0.8326],
    hexagon: [0.9210,0.9282,0.9441,0.9706,0.9984,1.0059,0.9896,0.9562,0.9290,0.9124,0.9047,0.9058,0.9157,0.9349,0.9642,0.9873,0.9882,0.9665,0.9336,0.9105,0.8968,0.8918,0.8955,0.9080,0.9293,0.9611,0.9820,0.9812,0.9590,0.9282,0.9089,0.8978,0.8964,0.9026,0.9189,0.9439,0.9778,0.9990,0.9964,0.9713,0.9439,0.9274,0.9196,0.9206,0.9308,0.9502,0.9799,1.0121,1.0226,1.0071,0.9752,0.9510,0.9366,0.9316,0.9351,0.9485,0.9711,1.0026,1.0213,1.0155,0.9863,0.9547,0.9347,0.9232],
    triangle: [0.7819,0.8211,0.8747,0.9440,1.0223,1.0960,1.1401,1.1340,1.0808,1.0047,0.9265,0.8603,0.8104,0.7730,0.7450,0.7273,0.7151,0.7118,0.7148,0.7245,0.7427,0.7680,0.8037,0.8518,0.9148,0.9876,1.0583,1.1073,1.1109,1.0667,0.9940,0.9164,0.8482,0.7948,0.7555,0.7261,0.7056,0.6925,0.6859,0.6869,0.6938,0.7084,0.7305,0.7615,0.8040,0.8595,0.9311,1.0092,1.0791,1.1171,1.1054,1.0501,0.9779,0.9050,0.8450,0.7990,0.7656,0.7413,0.7258,0.7160,0.7146,0.7204,0.7330,0.7528]
  };

  // --------------------------------------------------------------- shape.ts
  const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);
  const COS = ANGLES.map(Math.cos), SIN = ANGLES.map(Math.sin);
  const silhouette = (name, pose = {}) => ({ radii: [...PROFILES[name]], rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose });
  const circle = (radius, pose = {}) => ({ radii: new Array(PROFILE_SAMPLES).fill(radius), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose });
  function blend(a, b, t, out) {
    const dst = out || { radii: new Array(PROFILE_SAMPLES), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 };
    for (let i = 0; i < PROFILE_SAMPLES; i++) dst.radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t);
    let dRot = b.rot - a.rot; while (dRot > Math.PI) dRot -= TAU; while (dRot < -Math.PI) dRot += TAU;
    dst.rot = a.rot + dRot * t; dst.cx = lerp(a.cx, b.cx, t); dst.cy = lerp(a.cy, b.cy, t); dst.sx = lerp(a.sx, b.sx, t); dst.sy = lerp(a.sy, b.sy, t);
    return dst;
  }
  function toPoints(s, scale, out = []) {
    const cr = Math.cos(s.rot), sr = Math.sin(s.rot);
    for (let i = 0; i < PROFILE_SAMPLES; i++) { const r = s.radii[i] ?? 1, x = r * COS[i], y = r * SIN[i], rx = x * cr - y * sr, ry = x * sr + y * cr; const p = out[i] || { x: 0, y: 0 }; p.x = (rx * s.sx + s.cx) * scale; p.y = (ry * s.sy + s.cy) * scale; out[i] = p; }
    out.length = PROFILE_SAMPLES; return out;
  }
  function closedPath(pts, tension = 1 / 6) {
    const n = pts.length; if (n < 3) return ''; let d = `M${r2(pts[0].x)} ${r2(pts[0].y)}`;
    for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]; d += `C${r2(p1.x + (p2.x - p0.x) * tension)} ${r2(p1.y + (p2.y - p0.y) * tension)} ${r2(p2.x - (p3.x - p1.x) * tension)} ${r2(p2.y - (p3.y - p1.y) * tension)} ${r2(p2.x)} ${r2(p2.y)}`; }
    return d + 'Z';
  }
  function profileFromPolygon(poly, cx, cy) {
    const radii = new Array(PROFILE_SAMPLES).fill(0), n = poly.length;
    for (let k = 0; k < PROFILE_SAMPLES; k++) { const dx = COS[k], dy = SIN[k]; let best = 0;
      for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue; const px = a.x - cx, py = a.y - cy, t = (px * ey - py * ex) / den, u = (px * dy - py * dx) / den; if (t > best && u >= 0 && u <= 1) best = t; }
      radii[k] = best; }
    return radii;
  }
  function hullOfCircles(x1, y1, r1, x2, y2, r2v, steps = 96) {
    const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy) || 1e-6, base = Math.atan2(dy, dx), spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2v) / dist))), pts = [];
    for (let i = 0; i <= steps / 2; i++) { const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2); pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 }); }
    for (let i = 0; i <= steps / 2; i++) { const a = base - spread + ((2 * spread) * i) / (steps / 2); pts.push({ x: x2 + Math.cos(a) * r2v, y: y2 + Math.sin(a) * r2v }); }
    return pts;
  }
  function radiusAtAngle(radii, angle) { const n = radii.length, t = ((((angle / TAU) % 1) + 1) % 1) * n, i = Math.floor(t); return lerp(radii[i % n] ?? 1, radii[(i + 1) % n] ?? 1, t - i); }
  const superellipseProfile = (n, sx = 1, sy = 1) => ANGLES.map((_, i) => (Math.abs(COS[i] / sx) ** n + Math.abs(SIN[i] / sy) ** n) ** (-1 / n));
  function unionOfCirclesProfile(circles) { const out = new Array(PROFILE_SAMPLES).fill(0); for (let i = 0; i < PROFILE_SAMPLES; i++) { const dx = COS[i], dy = SIN[i]; let best = 0; for (const c of circles) { const b = dx * c.x + dy * c.y, disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r); if (disc < 0) continue; const t = b + Math.sqrt(disc); if (t > best) best = t; } out[i] = best; } return out; }
  function roundedPolygon(verts, rc, arcSteps = 10) {
    const n = verts.length, out = []; const normal = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1; return Math.atan2(-dx / len, dy / len); };
    for (let i = 0; i < n; i++) { const prev = verts[(i - 1 + n) % n], cur = verts[i], next = verts[(i + 1) % n], a0 = normal(prev, cur), a1 = normal(cur, next); let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; for (let k = 0; k <= arcSteps; k++) { const a = a0 + (d * k) / arcSteps; out.push({ x: cur.x + Math.cos(a) * rc, y: cur.y + Math.sin(a) * rc }); } }
    return out;
  }
  function regularPolygonProfile(sides, radius, rc, rotationDeg = 0) { const rot = (rotationDeg * Math.PI) / 180; const verts = Array.from({ length: sides }, (_, i) => { const a = rot + (i / sides) * TAU; return { x: Math.cos(a) * (radius - rc), y: Math.sin(a) * (radius - rc) }; }); return profileFromPolygon(roundedPolygon(verts, rc), 0, 0); }
  function polyPath(pts, scale = 1) { if (pts.length < 3) return ''; let d = ''; for (let i = 0; i < pts.length; i++) d += `${i === 0 ? 'M' : 'L'}${r2(pts[i].x * scale)} ${r2(pts[i].y * scale)}`; return d + 'Z'; }
  function capsulePath(w, h) { const hw = Math.max(w, 0.01) / 2, hh = Math.max(h, 0.01) / 2, r = Math.min(hw, hh); return `M${r2(-hw)} ${r2(-hh + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}L${r2(hw - r)} ${r2(-hh)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}L${r2(hw)} ${r2(hh - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}L${r2(-hw + r)} ${r2(hh)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`; }

  // --------------------------------------------------------------- skins.ts (customiser shapes, built analytically)
  const normalize = (radii, max = 1) => { const peak = Math.max(...radii); if (peak <= 0) return radii; const k = max / peak; return radii.map(r => r * k); };
  const pebble = normalize(ANGLES.map(a => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)), 1.02);
  const cloud = normalize(unionOfCirclesProfile([{ x: -0.44, y: 0.2, r: 0.54 }, { x: 0.46, y: 0.2, r: 0.5 }, { x: 0.02, y: 0.3, r: 0.6 }, { x: -0.24, y: -0.3, r: 0.48 }, { x: 0.3, y: -0.24, r: 0.44 }]), 1.02);
  const droplet = normalize(profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0), 1.04);
  const capsule = profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0);
  const SHAPES = [
    { id: 'circle', label: 'Circle', radii: new Array(PROFILE_SAMPLES).fill(1) },
    { id: 'pebble', label: 'Pebble', radii: pebble },
    { id: 'squircle', label: 'Squircle', radii: normalize(superellipseProfile(4.2), 1.15) },
    { id: 'capsule', label: 'Capsule', radii: capsule },
    { id: 'triangle', label: 'Triangle', radii: regularPolygonProfile(3, 1.12, 0.34, -90) },
    { id: 'hexagon', label: 'Hexagon', radii: regularPolygonProfile(6, 1.04, 0.26, 0) },
    { id: 'cloud', label: 'Cloud', radii: cloud },
    { id: 'droplet', label: 'Droplet', radii: droplet },
    { id: 'video-egg', label: 'Egg (video)', radii: [...PROFILES.egg] },
    { id: 'video-hexagon', label: 'Hexagon (video)', radii: [...PROFILES.hexagon] },
    { id: 'video-triangle', label: 'Triangle (video)', radii: [...PROFILES.triangle] }
  ];
  const SHAPE_BY_ID = new Map(SHAPES.map(s => [s.id, s]));
  const COLORS = [{ id: 'ink', hex: '#0a0a0c' }, { id: 'brown', hex: '#8b5e3c' }, { id: 'red', hex: '#e8483f' }, { id: 'orange', hex: '#f08a24' }, { id: 'amber', hex: '#f0b429' }, { id: 'green', hex: '#3ecf8e' }, { id: 'turquoise', hex: '#2fbfa0' }, { id: 'blue', hex: '#3b93f0' }, { id: 'violet', hex: '#8b5cf6' }, { id: 'pink', hex: '#e152b0' }, { id: 'grey', hex: '#a3a3a3' }, { id: 'cream', hex: '#f1efe9' }];
  function mixHex(from, to, t) { const parse = h => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }; const a = parse(from), b = parse(to); return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join(''); }

  // ---------------------------------------------------------------- face.ts (eyes painted on a sphere)
  const EYE_SPLIT = 15.46, EYE_W = 0.186, EYE_H = 0.412;
  const REST_GAZE = { yaw: 28.49, pitch: 28.62, roll: -13 };
  const deg = d => (d * Math.PI) / 180;
  function spin(u, v, angle) { const c = Math.cos(angle), s = Math.sin(angle); return [[u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s], [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s]]; }
  function eyePoses(gaze, scale, split = EYE_SPLIT) {
    let f = [0, 0, 1], right = [1, 0, 0], down = [0, 1, 0];
    [f, right] = spin(f, right, deg(gaze.yaw)); [down, f] = spin(down, f, deg(gaze.pitch)); [right, down] = spin(right, down, deg(gaze.roll));
    const build = side => { const [ef, er] = spin(f, right, deg(split * side)); return { x: ef[0] * scale, y: ef[1] * scale, a: er[0], b: er[1], c: down[0], d: down[1], depth: ef[2] }; };
    return [build(-1), build(1)];
  }
  const BLINK_RNG = createRng(0x5eed);
  const BLINKS = (() => { const out = []; let t = 1.4; while (t < 900) { out.push(t); t += 1.9 + BLINK_RNG() * 2.7; if (BLINK_RNG() < 0.18) { out.push(t); t += 0.24; } } return out; })();
  const BLINK_DUR = 0.18;
  function blinkLid(t) { for (let i = 0; i < BLINKS.length; i++) { const start = BLINKS[i]; if (t < start) break; const k = (t - start) / BLINK_DUR; if (k >= 0 && k <= 1) return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55; } return 1; }
  function liveliness(t, opt = {}) { const { wander = 1, blink = true, float = true } = opt; return { dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander, dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander, dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander, lid: blink ? blinkLid(t) : 1, driftX: float ? loopNoise(t, 7.9, 1.9) * 0.006 : 0, driftY: float ? loopNoise(t, 5.3, 0.3) * 0.007 : 0, breath: float ? 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 : 1 }; }
  const blinkScale = lid => 0.06 + 0.94 * clamp(lid);

  // --------------------------------------------------------------- decor.ts
  function wheel(hue, s = 0.55, l = 0.62) { const h = ((hue % 360) + 360) % 360, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; const hex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0'); return `#${hex(r)}${hex(g)}${hex(b)}`; }
  function arcRender(seed, t, scale, id, opacity = 1) {
    const sp = seed.phase + t * seed.speed * TAU, cu = Math.cos(seed.tilt), su = Math.sin(seed.tilt), kz = Math.sqrt(Math.max(0, 1 - seed.k * seed.k)), N = 64, span = seed.sweep * TAU;
    let front = '', back = '', prev = null;
    for (let i = 0; i <= N; i++) { const th = sp + (i / N) * span, ct = Math.cos(th), st = Math.sin(th); const x = seed.a * (ct * cu + st * -su * seed.k) + seed.cx, y = seed.a * (ct * su + st * cu * seed.k) + seed.cy, z = seed.a * st * kz; const behind = z < 0, sx = r2(x * scale), sy = r2(y * scale), cmd = behind !== prev ? 'M' : 'L'; if (behind) back += `${cmd}${sx} ${sy}`; else front += `${cmd}${sx} ${sy}`; prev = behind; }
    const gx = Math.cos(seed.tilt) * seed.a * scale, gy = Math.sin(seed.tilt) * seed.a * scale;
    return { id, front, back, width: seed.width * scale, opacity, grad: { x1: r2(seed.cx * scale - gx), y1: r2(seed.cy * scale - gy), x2: r2(seed.cx * scale + gx), y2: r2(seed.cy * scale + gy), stops: [wheel(seed.hue), wheel(seed.hue + seed.hueSpan * 0.5), wheel(seed.hue + seed.hueSpan)] } };
  }
  const RING_RNG = createRng(0xa11ce);
  const RINGS = Array.from({ length: 6 }, (_, i) => ({ a: 1.3 + RING_RNG() * 0.1, k: 0.05 + RING_RNG() * 0.4, tilt: (i / 6) * Math.PI + RING_RNG() * 0.5, speed: 3 + RING_RNG() * 0.7, phase: RING_RNG() * TAU, sweep: 0.6 + RING_RNG() * 0.25, hue: (i * 360) / 6 + RING_RNG() * 30, hueSpan: 60 + RING_RNG() * 60, width: 0.05 + RING_RNG() * 0.012, cx: 0, cy: 0.1 }));
  const SWOOSH = Array.from({ length: 4 }, (_, i) => ({ a: 0.78 + i * 0.2, k: 0.05 + i * 0.02, tilt: -0.62 + i * 0.05, speed: 0.3, phase: 0.06 * i, sweep: 0.4, hue: 95 + i * 62, hueSpan: 100, width: 0.05, cx: 0, cy: -0.12 }));
  const DOT_X = [-0.557, -0.013, 0.532], DOT_R = 0.165, DOT_PEAK = 1.25;
  const P_RNG = createRng(0xbeef);
  const PARTICLES = Array.from({ length: 5 }, (_, i) => ({ birth: i * 0.2, angle: P_RNG() * TAU, rho: 0.58 + P_RNG() * 0.18 }));
  function particles(t, scale) { const out = []; for (const p of PARTICLES) { const u = t - p.birth; if (u < 0 || u > 0.62) continue; const rho = p.rho * Math.pow(0.75, u * 10), a = p.angle + (u * 100 * Math.PI) / 180; out.push({ x: Math.cos(a) * rho * scale, y: Math.sin(a) * rho * scale, r: (0.04 + 0.028 * clamp(u / 0.55)) * scale, depth: clamp(1 - rho / 0.8), opacity: clamp(u / 0.06) * clamp((0.62 - u) / 0.08) }); } return out; }
  const COMET_RNG = createRng(0xc0e7);
  const COMET_RIBBONS = Array.from({ length: 4 }, (_, i) => { const d = i - 1.5; return { a: 0.85 * (1 + d * 0.03), k: (0.15 / 0.85) * (1 + d * 0.16), tilt: (34 * Math.PI) / 180 + d * 0.035, speed: 210 / 360, phase: -i * 0.045 + COMET_RNG() * 0.012, sweep: 0.34, hue: i * 85 + COMET_RNG() * 20, hueSpan: 80, width: 0.095, cx: 0, cy: 0 }; });
  const COMET_DOT = 0.129;
  const NOTIF_BLUE = '#2496e8', NOTIF_ANGLE = -42, NOTIF_DIST = 1.003, NOTIF_R = 0.15, NOTIF_POP = 1.14, NOTIF_MARGIN = 0.054;

  // --------------------------------------------------------- expressions.ts (rest faces)
  const eye = (w, h, tilt = 0, open = 1) => ({ w, h, tilt, open });
  const epair = (w, h, tilt = 0, open = 1) => [eye(w, h, tilt, open), eye(w, h, -tilt, open)];
  const EXPRESSIONS = [
    { id: 'neutral', gaze: { ...REST_GAZE }, split: EYE_SPLIT, eyes: [eye(EYE_W, EYE_H), eye(EYE_W, EYE_H)] },
    { id: 'attentive', gaze: { yaw: 4, pitch: 5, roll: -4 }, split: 16, eyes: epair(0.21, 0.44) },
    { id: 'surprised', gaze: { yaw: 3, pitch: -3, roll: 0 }, split: 19, eyes: epair(0.45, 0.47) },
    { id: 'excited', gaze: { yaw: 6, pitch: -14, roll: 0 }, split: 19.5, eyes: epair(0.4, 0.56, -10) },
    { id: 'happy', gaze: { yaw: 5, pitch: 9, roll: 0 }, split: 17, eyes: epair(0.27, 0.17, 14) },
    { id: 'laughing', gaze: { yaw: 4, pitch: 14, roll: 0 }, split: 18, eyes: epair(0.34, 0.13, 20) },
    { id: 'angry', gaze: { yaw: 3, pitch: 7, roll: 0 }, split: 17, eyes: epair(0.34, 0.15, 30) },
    { id: 'sad', gaze: { yaw: 3, pitch: -13, roll: 0 }, split: 16, eyes: epair(0.22, 0.4, -28) },
    { id: 'scared', gaze: { yaw: 2, pitch: -20, roll: 0 }, split: 20.5, eyes: epair(0.4, 0.6) },
    { id: 'suspicious', gaze: { yaw: 12, pitch: 6, roll: -6 }, split: 16, eyes: [eye(0.21, 0.4), eye(0.22, 0.15)] },
    { id: 'confused', gaze: { yaw: -14, pitch: 3, roll: 8 }, split: 16.5, eyes: [eye(0.2, 0.44, -18), eye(0.28, 0.17, 14)] },
    { id: 'curious', gaze: { yaw: 16, pitch: -9, roll: -15 }, split: 16.5, eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)] },
    { id: 'proud', gaze: { yaw: 5, pitch: 17, roll: 0 }, split: 17, eyes: epair(0.3, 0.15, 18) },
    { id: 'shy', gaze: { yaw: -19, pitch: -14, roll: -7 }, split: 14, eyes: epair(0.17, 0.3) },
    { id: 'unimpressed', gaze: { yaw: -22, pitch: 2, roll: 0 }, split: 16, eyes: epair(0.3, 0.12) },
    { id: 'sleepy', gaze: { yaw: 6, pitch: -9, roll: -3 }, split: 16, eyes: epair(0.2, 0.42, 0, 0.42) }
  ];
  const EXPRESSION_BY_ID = new Map(EXPRESSIONS.map(e => [e.id, e]));
  const lerpEye = (a, b, t) => ({ w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t), open: lerp(a.open, b.open, t) });
  const blendExpression = (a, b, t) => ({ id: b.id, gaze: { yaw: lerp(a.gaze.yaw, b.gaze.yaw, t), pitch: lerp(a.gaze.pitch, b.gaze.pitch, t), roll: lerp(a.gaze.roll, b.gaze.roll, t) }, split: lerp(a.split, b.split, t), eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)] });

  // -------------------------------------------------------------- states.ts (measured poses)
  const pair = (w, h) => [{ w, h, open: 1 }, { w, h, open: 1 }];
  const base = (over = {}) => ({ sil: circle(1), offX: 0, offY: 0, gaze: { ...REST_GAZE }, split: EYE_SPLIT, eyes: pair(EYE_W, EYE_H), eyeAlpha: 1, bodyAlpha: 1, dots: [], arcs: [], notif: null, dotsBehind: false, ...over });
  const BAR_UPRIGHT_CY = -0.1875;
  const BAR_UPRIGHT = profileFromPolygon(hullOfCircles(0, -0.505, 0.132, 0, 0.13, 0.075), 0, BAR_UPRIGHT_CY);
  const BAR_ITALIC = profileFromPolygon(hullOfCircles(0, -0.2535, 0.1345, 0, 0.2535, 0.1345), 0, 0);
  const barUpright = (pose = {}) => ({ radii: [...BAR_UPRIGHT], rot: 0, cx: 0, cy: BAR_UPRIGHT_CY, sx: 1, sy: 1, ...pose });
  const barItalic = (pose = {}) => ({ radii: [...BAR_ITALIC], rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose });
  const TEAR = polyPath(hullOfCircles(0, 0, 0.118, 0, 0.172, 0.012));
  const TRI_ORBIT = 0.213;
  const spinningTriangle = rot => silhouette('triangle', { rot, cx: -TRI_ORBIT * Math.sin(rot), cy: TRI_ORBIT * Math.cos(rot) });
  function dotPulse(t, index) { const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1, k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0; return clamp(k * 2); }
  const STATES = [
    { id: 'idle', duration: 2.4, morph: 0.45, blinkIn: false, baseFace: true, baseBody: true, pose: () => base() },
    { id: 'thinking', duration: 2.6, morph: 0.4, baseFace: false, baseBody: false, blinkIn: true, pose: t => { const mid = dotPulse(t, 1), emerge = 0.3 + 0.7 * easings.easeOutCubic(clamp(t / 0.3)); return base({ sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1] }), eyeAlpha: 0, dots: [0, 2].map(i => { const k = dotPulse(t, i); return { x: DOT_X[i] * emerge, y: 0, r: DOT_R * (1 + (DOT_PEAK - 1) * k), opacity: 0.55 + 0.45 * k }; }) }); } },
    { id: 'wink', duration: 1.6, morph: 0.3, blinkIn: true, baseFace: false, baseBody: true, pose: () => base({ gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 }, split: 16.25, eyes: [{ w: 0.236, h: 0.464, open: 1 }, { w: 0.447, h: 0.089, open: 1 }] }) },
    { id: 'wide', duration: 1.8, morph: 0.55, blinkIn: true, baseFace: false, baseBody: true, pose: () => base({ gaze: { yaw: 6.92, pitch: -21.96, roll: 11.6 }, split: 18.43, eyes: pair(0.356, 0.875) }) },
    { id: 'alert', duration: 2.4, minDuration: 2, morph: 0.45, baseFace: false, baseBody: false, blinkIn: false, pose: t => { const p = clamp(t / 1.5), travel = easings.easeInOutCubic(p) * 0.82 - 0.087, back = t > 1.6 ? clamp((t - 1.6) / 0.4) : 0, x = travel * (1 - back) + 0.1 * back, buzz = Math.sin(t * 2.5 * TAU) * 0.005, tilt = (17.7 * Math.PI) / 180; return base({ sil: barItalic({ rot: tilt, cx: x, cy: -0.325 - buzz }), eyeAlpha: 0, dots: [{ x: x - Math.sin(tilt) * 0.58, y: -0.325 + Math.cos(tilt) * 0.58 + buzz * 2.8, r: 0.118, d: TEAR, rot: (tilt * 180) / Math.PI, opacity: 1 }] }); } },
    { id: 'notify', duration: 2.2, morph: 0.5, blinkIn: true, baseFace: false, baseBody: true, pose: t => { const p = clamp(t / 0.45), pop = 1 + (NOTIF_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35), r = NOTIF_R * (p < 1 ? pop : 1), a = (NOTIF_ANGLE * Math.PI) / 180; return base({ gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 }, split: 18.89, eyes: pair(0.505, 0.498), notif: { x: Math.cos(a) * NOTIF_DIST, y: Math.sin(a) * NOTIF_DIST, r, notch: r + NOTIF_MARGIN } }); } },
    { id: 'exclaim', duration: 2, morph: 0.45, baseFace: false, baseBody: false, blinkIn: false, pose: () => base({ sil: barUpright(), eyeAlpha: 0, dots: [{ x: -0.012, y: 0.526, r: 0.113, opacity: 1 }] }) },
    { id: 'sleep', duration: 2.4, morph: 0.5, baseFace: false, baseBody: false, blinkIn: false, pose: t => base({ sil: circle(0.1585, { cy: 0.11 + Math.sin(t * (TAU / 0.6)) * 0.19 }), eyeAlpha: 0 }) },
    { id: 'egg', duration: 1.8, morph: 0.4, baseFace: false, baseBody: false, blinkIn: true, pose: () => base({ sil: silhouette('egg'), gaze: { yaw: 19.97, pitch: 26.01, roll: -17.1 }, split: 11.07, eyes: pair(0.164, 0.385) }) },
    { id: 'hexagon', duration: 1.6, morph: 0.4, baseFace: false, baseBody: false, blinkIn: true, pose: () => base({ sil: silhouette('hexagon'), gaze: { yaw: 23.11, pitch: 24.42, roll: -13.3 }, split: 13.37, eyes: pair(0.177, 0.411) }) },
    { id: 'play', duration: 2, morph: 0.5, baseFace: false, baseBody: false, blinkIn: true, pose: t => { const fade = clamp(t / 0.35) * clamp((2.2 - t) / 0.5); return base({ sil: spinningTriangle(0), gaze: { yaw: 12, pitch: -8, roll: -6 }, split: 15, eyes: pair(0.18, 0.34), arcs: SWOOSH.map((s, i) => ({ id: `sw${i}`, seed: { ...s, cx: 0.45 - t * 0.42 }, t, opacity: fade })) }); } },
    { id: 'orbit', duration: 3.4, minDuration: 2.5, morph: 0.6, baseFace: false, baseBody: false, blinkIn: false, pose: t => { const ramp = easings.easeInOutCubic(clamp(t / 0.35)), rot = -TAU * 1.25 * t * ramp, back = easings.easeInOutCubic(clamp((t - 1.6) / 0.9)), tri = spinningTriangle(rot), ball = circle(1, { rot }); const sil = { radii: tri.radii.map((r, i) => r + (ball.radii[i] - r) * back), rot, cx: tri.cx * (1 - back), cy: tri.cy * (1 - back), sx: 1, sy: 1 }; const fade = clamp(t / 0.8) * clamp((3.6 - t) / 0.9); return base({ sil, gaze: { yaw: REST_GAZE.yaw + Math.sin(t * 6.5) * 65 * (1 - back), pitch: -4 + back * 32, roll: -13 }, eyes: pair(0.18, 0.34 + back * 0.07), arcs: RINGS.map((s, i) => ({ id: `rg${i}`, seed: s, t, opacity: fade * clamp((t - i * 0.13) / 0.3) })) }); } },
    { id: 'burst', duration: 2.6, minDuration: 2.4, morph: 0.4, baseFace: false, baseBody: false, blinkIn: false, pose: t => { const collapse = 1 - 0.834 * easings.easeOutQuint(clamp(t / 0.7)), regrow = easings.easeOutQuint(clamp((t - 1.7) / 0.7)); return base({ sil: circle(collapse + (1 - collapse) * regrow), eyeAlpha: clamp((t - 1.85) / 0.4), dots: particles(t, 1), dotsBehind: true }); } },
    { id: 'comet', duration: 2.4, minDuration: 2.4, morph: 0.45, baseFace: false, baseBody: false, blinkIn: false, pose: t => { const collapse = 1 - (1 - COMET_DOT) * easings.easeOutQuint(clamp(t / 0.55)), regrow = easings.easeOutQuint(clamp((t - 1.85) / 0.6)), fade = clamp((t - 0.15) / 0.25) * clamp((1.95 - t) / 0.3); return base({ sil: circle(collapse + (1 - collapse) * regrow, { cy: Math.sin(clamp(t / 1.7) * Math.PI) * 0.035 }), eyeAlpha: clamp((t - 2) / 0.35), arcs: COMET_RIBBONS.map((s, i) => ({ id: `cm${i}`, seed: s, t, opacity: fade })) }); } }
  ];
  const STATE_BY_ID = new Map(STATES.map(s => [s.id, s]));
  const POSES = { idle: 1, thinking: 1.1, wink: 0.8, wide: 0.8, alert: 0.75, notify: 0.9, exclaim: 0.8, sleep: 0.45, egg: 0.8, hexagon: 0.8, play: 0.9, orbit: 1.2, burst: 0.45, comet: 1.15 };

  // -------------------------------------------------------------- engine.ts (clockless: sample(t) is a pure function of time)
  const NO_LOOK = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 };
  const lerpLook = (a, b, t) => ({ yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), mix: lerp(a.mix, b.mix, t), spin: lerp(a.spin, b.spin, t), wander: lerp(a.wander, b.wander, t) });
  function blendPose(a, b, t) { const out = 1 - t; return { sil: blend(a.sil, b.sil, t), offX: lerp(a.offX, b.offX, t), offY: lerp(a.offY, b.offY, t), gaze: { yaw: lerp(a.gaze.yaw, b.gaze.yaw, t), pitch: lerp(a.gaze.pitch, b.gaze.pitch, t), roll: lerp(a.gaze.roll, b.gaze.roll, t) }, split: lerp(a.split, b.split, t), eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)], eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t), bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t), dots: [...a.dots.map(d => ({ ...d, opacity: d.opacity * out })), ...b.dots.map(d => ({ ...d, opacity: d.opacity * t }))], arcs: [...a.arcs.map(r => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })), ...b.arcs.map(r => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t }))], notif: t < 0.5 ? a.notif : b.notif, dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind }; }
  class BotEngine {
    static SHAPE_MORPH = 0.45; static LOOK_MORPH = 0.24;
    constructor(scale = 100, initial = 'idle', shape = null, expression = null) { this.scale = scale; this.cur = initial; this.prev = null; this.departFige = null; this.tCur = 0; this.tPrev = 0; this.blinkAt = -10; this.pts = []; this.shape = shape; this.shapePrev = null; this.shapeAt = -10; this.expr = expression; this.exprPrev = null; this.exprAt = -10; this.look = NO_LOOK; this.lookPrev = NO_LOOK; this.lookAt = -10; this.lookMorph = BotEngine.LOOK_MORPH; }
    setExpression(expression, now = 0) { if (expression === this.expr) return; this.exprPrev = this.expr; this.expr = expression; this.exprAt = now; }
    exprAtTime(now) { const to = this.expr, from = this.exprPrev; if (!to || !from) return to; const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH; if (k >= 1) return to; return blendExpression(from, to, easings.easeOutQuint(clamp(k))); }
    setShape(radii, now = 0) { if (radii === this.shape) return; this.shapePrev = this.shape; this.shape = radii; this.shapeAt = now; }
    shapeAtTime(now) { const to = this.shape, from = this.shapePrev; if (!to || !from) return to; const k = (now - this.shapeAt) / BotEngine.SHAPE_MORPH; if (k >= 1) return to; const t = easings.easeOutQuint(clamp(k)); return to.map((r, i) => lerp(from[i] ?? r, r, t)); }
    setLook(look, now, morph = BotEngine.LOOK_MORPH) { if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.spin + look.wander)) return; this.lookPrev = this.lookAtTime(now); this.look = look || NO_LOOK; this.lookAt = now; this.lookMorph = morph; }
    lookAtTime(now) { const k = (now - this.lookAt) / this.lookMorph; if (k >= 1) return this.look; return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k))); }
    posed(def, t, shape, expr) { let pose = def.pose(t); if (def.baseBody && shape) pose = { ...pose, sil: { ...pose.sil, radii: shape } }; if (def.baseFace && expr) pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes }; return pose; }
    get state() { return this.cur; }
    reset(id, now) { this.cur = id; this.prev = null; this.departFige = null; this.tCur = now; this.tPrev = now; this.blinkAt = -10; }
    origine(now, shape, expr) { if (this.departFige) return this.departFige; if (!this.prev) return null; return this.posed(STATE_BY_ID.get(this.prev), Math.max(0, now - this.tPrev), shape, expr); }
    poseComposee(now) { const def = STATE_BY_ID.get(this.cur), shape = this.shapeAtTime(now), expr = this.exprAtTime(now), pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr), since = now - this.tCur; if (since >= def.morph) return pose; const origine = this.origine(now, shape, expr); if (!origine) return pose; return blendPose(origine, pose, easings.easeOutQuint(clamp(since / def.morph))); }
    setState(id, now) { if (id === this.cur) return; const morph = STATE_BY_ID.get(this.cur).morph, enPleinFondu = this.prev !== null && now - this.tCur < morph; this.departFige = enPleinFondu ? this.poseComposee(now) : null; this.prev = this.cur; this.tPrev = this.tCur; this.cur = id; this.tCur = now; if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now; }
    sample(now) {
      const R = this.scale, def = STATE_BY_ID.get(this.cur), shape = this.shapeAtTime(now), expr = this.exprAtTime(now);
      let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
      const since = now - this.tCur, origine = since < def.morph ? this.origine(now, shape, expr) : null;
      if (origine) pose = blendPose(origine, pose, easings.easeOutQuint(clamp(since / def.morph)));
      const alive = pose.eyeAlpha > 0.01, look = this.lookAtTime(now), life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive });
      const gaze = { yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin, pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch, roll: pose.gaze.roll + life.dRoll };
      const forced = clamp((now - this.blinkAt) / 0.2), forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1, lid = Math.min(life.lid, forcedLid);
      const offX = pose.offX + life.driftX, offY = pose.offY + life.driftY;
      const sil = { ...pose.sil, cx: pose.sil.cx + offX, cy: pose.sil.cy + offY, sy: pose.sil.sy * life.breath };
      const bodyPath = closedPath(toPoints(sil, R, this.pts));
      const bodyRadius = (x, y) => radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);
      const eyes = [];
      if (pose.eyeAlpha > 0.01) { const poses = eyePoses(gaze, R, pose.split); for (let i = 0; i < 2; i++) { const e = poses[i]; if (e.depth <= 0.02) continue; const cfg = pose.eyes[i], fit = bodyRadius(e.x, e.y), phi = ((cfg.tilt ?? 0) * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi), ax = e.a * cp + e.c * sp, ay = e.b * cp + e.d * sp, cx2 = -e.a * sp + e.c * cp, cy2 = -e.b * sp + e.d * cp, k = blinkScale(Math.min(lid, cfg.open)); eyes.push({ w: cfg.w * R, h: cfg.h * R, m: [ax, ay * k, cx2, cy2 * k, e.x * fit + offX * R, e.y * fit + offY * R], alpha: pose.eyeAlpha * clamp(e.depth / 0.12) }); } }
      const dots = pose.dots.filter(p => p.opacity > 0.01 && p.r > 0.0005).map(p => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }));
      const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1, nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0, ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0;
      return { bodyPath, bodyAlpha: pose.bodyAlpha, eyes, dots, dotsBehind: pose.dotsBehind, arcs: pose.arcs.map(a => arcRender(a.seed, a.t, R, a.id, a.opacity)), notif: pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null, notch: pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null };
    }
  }

  // ------------------------------------------------------------- timeline + canvas renderer (this file's own additions)
  const RAYON = 100;
  /** Deterministic sample of a bot at time t. blocks = [[stateId, seconds, expressionId?], ...] */
  function sampleTimeline(blocks, t, opt = {}) {
    const R = opt.scale || RAYON, shape = opt.shape ? SHAPE_BY_ID.get(opt.shape)?.radii || null : null;
    const bl = blocks.length ? blocks : [['idle', 1]];
    const exprOf = b => EXPRESSION_BY_ID.get(b[2] || opt.expression || 'neutral') || null;
    const eng = new BotEngine(R, bl[0][0], shape, exprOf(bl[0]));
    if (opt.look) eng.setLook({ ...NO_LOOK, ...opt.look }, -10);
    let acc = 0;
    for (let i = 1; i < bl.length; i++) { acc += bl[i - 1][1]; if (t >= acc) { eng.setState(bl[i][0], acc); eng.setExpression(exprOf(bl[i]), acc); } }
    return eng.sample(Math.max(0, t));
  }
  const strokeArc = (ctx, a, part) => { const d = a[part]; if (!d) return; const g = ctx.createLinearGradient(a.grad.x1, a.grad.y1, a.grad.x2, a.grad.y2); a.grad.stops.forEach((s, i) => g.addColorStop(i / 2, s)); ctx.save(); ctx.globalAlpha = a.opacity; ctx.strokeStyle = g; ctx.lineWidth = a.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D(d)); ctx.restore(); };
  const drawDots = (ctx, dots, body, paper, R) => { for (const d of dots) { ctx.save(); ctx.globalAlpha = d.opacity; ctx.fillStyle = d.color || (d.depth != null ? mixHex(paper, body, d.depth) : body); if (d.d) { ctx.translate(d.x, d.y); ctx.rotate(((d.rot || 0) * Math.PI) / 180); ctx.scale(R, R); ctx.fill(new Path2D(d.d)); } else { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); } ctx.restore(); } };
  /**
   * Draw one sampled frame at the current transform (origin = ball centre, units = viewBox, ball radius R).
   * Must be called on a cleared layer: the notification notch is punched with destination-out.
   */
  function drawFrame(ctx, f, o) {
    const body = o.bodyColor || '#0a0a0c', paper = o.paper || '#ffffff', eyeCol = o.eyeColor || paper, R = o.scale || RAYON;
    for (const a of f.arcs) strokeArc(ctx, a, 'back');
    if (f.dotsBehind) drawDots(ctx, f.dots, body, paper, R);
    ctx.save(); ctx.globalAlpha = f.bodyAlpha; ctx.fillStyle = body; ctx.fill(new Path2D(f.bodyPath)); ctx.restore();
    if (f.notch) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(f.notch.x, f.notch.y, f.notch.r, 0, TAU); ctx.fill(); ctx.restore(); }
    for (const e of f.eyes) { ctx.save(); ctx.globalAlpha = e.alpha; ctx.transform(e.m[0], e.m[1], e.m[2], e.m[3], e.m[4], e.m[5]); ctx.fillStyle = eyeCol; ctx.fill(new Path2D(capsulePath(e.w, e.h))); ctx.restore(); }
    if (!f.dotsBehind) drawDots(ctx, f.dots, body, paper, R);
    if (f.notif) { ctx.save(); ctx.fillStyle = o.notifColor || NOTIF_BLUE; ctx.beginPath(); ctx.arc(f.notif.x, f.notif.y, f.notif.r, 0, TAU); ctx.fill(); ctx.restore(); }
    for (const a of f.arcs) strokeArc(ctx, a, 'front');
  }
  /** Path (viewBox units, centred) of a rest shape, for thumbnails and hit testing. */
  const shapePath = (id, R = RAYON) => closedPath(toPoints({ radii: SHAPE_BY_ID.get(id)?.radii || SHAPES[0].radii, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }, R));

  return { RAYON, SHAPES, SHAPE_BY_ID, COLORS, STATES, STATE_BY_ID, POSES, EXPRESSIONS, EXPRESSION_BY_ID, REST_GAZE, NOTIF_BLUE, BotEngine, sampleTimeline, drawFrame, shapePath, capsulePath, eyePoses, mixHex };
})();
