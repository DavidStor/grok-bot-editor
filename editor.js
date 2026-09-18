/*
 * Bot Photo Animator — editor UI.
 *
 * Everything that draws a bot comes from bloub-engine.js (window.Bloub): shapes,
 * eyes, animation states, faces and timings. This file is the page around it:
 * the photo, the canvas, the bot list, the controls, the timeline, the exports
 * and the first-visit tutorial.
 */
(() => {
  'use strict';

  const B = window.Bloub;
  const R = B.RAYON;                       // ball radius in engine units
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------------------------------------------------------------- catalogue

  /** Human labels for bloub's measured states, with what each one does. */
  const STATE_INFO = {
    idle:     { label: 'Idle',      help: 'Rests, blinks and looks around, wearing the bot\'s face.' },
    wink:     { label: 'Wink',      help: 'Closes one eye.' },
    wide:     { label: 'Wide eyes', help: 'Eyes open wide, looking up.' },
    notify:   { label: 'Notify',    help: 'A badge pops in on the shoulder; the bot glances away.' },
    thinking: { label: 'Thinking',  help: 'Turns into three pulsing dots.' },
    alert:    { label: 'Alert',     help: 'Becomes a leaning exclamation mark that slides across.' },
    exclaim:  { label: 'Exclaim',   help: 'Becomes an upright exclamation mark.' },
    sleep:    { label: 'Sleep',     help: 'Shrinks to a small bouncing dot.' },
    egg:      { label: 'Egg',       help: 'Squeezes into an egg.' },
    hexagon:  { label: 'Hexagon',   help: 'Turns into a rounded hexagon.' },
    play:     { label: 'Play',      help: 'Turns into a triangle with a swoosh passing over it.' },
    orbit:    { label: 'Orbit',     help: 'Rings spin around it while it settles back to a ball.' },
    burst:    { label: 'Burst',     help: 'Collapses into particles, then re-forms.' },
    comet:    { label: 'Comet',     help: 'Shrinks to a dot with a comet trail circling it.' }
  };
  const STATE_ORDER = Object.keys(STATE_INFO);
  const FACE_IDS = B.EXPRESSIONS.map((e) => e.id);
  const capitalise = (id) => id.charAt(0).toUpperCase() + id.slice(1);

  /** bloub's customiser palette first, then colours seen in x.ai's own posts. */
  const PALETTE = [
    ...B.COLORS.map((c) => c.hex),
    '#000000', '#ffffff', '#9159fe', '#ff9800', '#1084fe', '#00bca6', '#ff6700', '#3c82f6', '#ea4045', '#885cf5', '#54b9a6'
  ];

  // ------------------------------------------------------------------ project

  const STORAGE_KEY = 'botPhotoAnimator';
  const TUTORIAL_KEY = 'botPhotoAnimatorTutorial';

  const newBot = (overrides) => ({
    name: 'Bot',
    shape: 'circle',
    color: '#0a0a0c',
    eyeColor: '#ffffff',
    badgeColor: B.NOTIF_BLUE,
    x: 0.5,                   // centre, as a fraction of the canvas width
    y: 0.5,                   // centre, as a fraction of the canvas height
    size: 0.25,               // ball diameter, as a fraction of the canvas width
    rotation: 0,              // radians
    face: 'neutral',          // expression worn while idle
    look: 'auto',             // 'auto' | 'centre' | 'custom'
    lookYaw: 0,               // custom look: degrees, positive = right
    lookPitch: 0,             // custom look: degrees, positive = up
    lookMix: 0.8,             // custom look: 0 = animations decide, 1 = always this direction
    visible: true,
    timeline: [['idle', 10]], // [state, seconds, face?]
    ...overrides
  });

  const defaultProject = () => ({
    duration: 10,
    fps: 30,
    preset: 'auto',
    cw: 1080,
    ch: 1440,
    fit: 'cover',
    fx: 50,
    fy: 50,
    bg: '#f7f7f7',
    bots: [
      newBot({ name: 'Black',  shape: 'capsule',  color: '#0a0a0c', x: 0.215, y: 0.175, size: 0.22, timeline: [['idle', 2.5], ['idle', 2.5], ['notify', 2.5], ['idle', 2.5]] }),
      newBot({ name: 'Red',    shape: 'triangle', color: '#e8483f', x: 0.795, y: 0.225, size: 0.21, timeline: [['idle', 2.5], ['idle', 2.5], ['idle', 2.5, 'surprised'], ['idle', 2.5]] }),
      newBot({ name: 'Blue',   shape: 'circle',   color: '#3b93f0', x: 0.85,  y: 0.95,  size: 0.62, look: 'centre', timeline: [['idle', 2], ['idle', 2], ['wink', 2], ['idle', 2], ['wide', 2]] }),
      newBot({ name: 'Orange', shape: 'cloud',    color: '#f08a24', x: 0.13,  y: 0.87,  size: 0.27, rotation: Math.PI / 4, timeline: [['idle', 2.5], ['idle', 2.5, 'surprised'], ['idle', 5]] })
    ]
  });

  let project = defaultProject();
  let photo = null;          // HTMLImageElement
  let photoData = null;      // data: URL, so a saved project file can carry the photo
  let selected = -1;         // index into project.bots
  let paused = false;
  let playStart = performance.now();
  let scrubTime = 0;
  let exporting = false;

  const loadSaved = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || !Array.isArray(saved.bots)) return;
      project = saved;
      // older saves had no `look` field
      project.bots.forEach((b) => { if (!b.look) b.look = b.lookMix > 0 ? 'custom' : 'auto'; if (!b.lookMix) b.lookMix = 0.8; });
    } catch (e) { /* private window or blocked storage: start fresh */ }
  };
  const persist = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch (e) { /* ignore */ }
  };

  // ---------------------------------------------------------------- rendering

  const stage = $('stage');
  const ctx = stage.getContext('2d');
  const layer = document.createElement('canvas');     // one bot at a time: the notify notch needs a clean layer
  const layerCtx = layer.getContext('2d');

  /** Engine units -> canvas pixels for a bot. */
  const botScale = (bot, width) => (bot.size * width) / (2 * R);

  /** Rough head turn that points a bot at the middle of the canvas. */
  const lookAtCentre = (bot) => ({
    yaw: clamp((0.5 - bot.x) * 110, -60, 60),
    pitch: clamp((bot.y - 0.5) * 110, -60, 60),
    mix: 0.8, spin: 0, wander: 1
  });

  const lookFor = (bot) => {
    if (bot.look === 'centre') return lookAtCentre(bot);
    if (bot.look === 'custom') return { yaw: bot.lookYaw, pitch: bot.lookPitch, mix: bot.lookMix, spin: 0, wander: 1 };
    return null;
  };

  const sampleBot = (bot, t) => B.sampleTimeline(bot.timeline, t, { shape: bot.shape, expression: bot.face, look: lookFor(bot) });

  const drawBot = (bot, t, width, height, index) => {
    if (bot.visible === false) return;
    const frame = sampleBot(bot, t);
    const k = botScale(bot, width);

    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, width, height);
    layerCtx.translate(bot.x * width, bot.y * height);
    layerCtx.rotate(bot.rotation || 0);
    layerCtx.scale(k, k);
    B.drawFrame(layerCtx, frame, { bodyColor: bot.color, eyeColor: bot.eyeColor, paper: bot.eyeColor, notifColor: bot.badgeColor, scale: R });
    ctx.drawImage(layer, 0, 0);

    if (!exporting && index === selected) {
      ctx.save();
      ctx.translate(bot.x * width, bot.y * height);
      ctx.rotate(bot.rotation || 0);
      ctx.scale(k, k);
      const outline = new Path2D(frame.bodyPath);
      ctx.lineWidth = 3 / k;
      ctx.setLineDash([12 / k, 8 / k]);
      ctx.strokeStyle = '#fff';
      ctx.stroke(outline);
      ctx.strokeStyle = '#000';
      ctx.lineDashOffset = 12 / k;
      ctx.stroke(outline);
      ctx.restore();
    }
  };

  const drawPhoto = (width, height) => {
    if (!photo) {
      if (!exporting) {
        ctx.fillStyle = 'rgba(128,128,128,.6)';
        ctx.font = `${Math.round(width * 0.03)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('choose a photo on the left, or keep the plain background', width / 2, height / 2);
      }
      return;
    }
    const cover = project.fit !== 'contain';
    const s = cover ? Math.max(width / photo.width, height / photo.height) : Math.min(width / photo.width, height / photo.height);
    const dw = photo.width * s;
    const dh = photo.height * s;
    ctx.drawImage(photo, (width - dw) * project.fx / 100, (height - dh) * project.fy / 100, dw, dh);
  };

  /** Paint the whole scene at time t (seconds). */
  const renderFrame = (t) => {
    const width = stage.width;
    const height = stage.height;
    if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
    ctx.fillStyle = project.bg;
    ctx.fillRect(0, 0, width, height);
    drawPhoto(width, height);
    project.bots.forEach((bot, i) => drawBot(bot, t, width, height, i));
  };

  const applyCanvasSize = () => {
    let w = 1080;
    let h = 1440;
    if (project.preset === 'auto') {
      if (photo) h = Math.round((w * photo.height) / photo.width / 2) * 2;
    } else if (project.preset === 'custom') {
      w = +project.cw || 1080;
      h = +project.ch || 1440;
    } else {
      [w, h] = project.preset.split('x').map(Number);
    }
    if (stage.width !== w || stage.height !== h) { stage.width = w; stage.height = h; }
    $('scrub').max = project.duration;
  };

  const currentTime = () => (paused ? scrubTime : ((performance.now() - playStart) / 1000) % project.duration);

  const tick = () => {
    if (!paused) {
      const t = currentTime();
      renderFrame(t);
      $('scrub').value = t;
      $('scrubValue').textContent = `${t.toFixed(2)} s`;
    }
    requestAnimationFrame(tick);
  };

  /** Re-paint now if playback is paused (while playing, the next tick does it). */
  const refresh = () => { if (paused) renderFrame(scrubTime); };

  // -------------------------------------------------------------- thumbnails

  /**
   * Small live preview of a shape, a state or a face, drawn on `canvas` (or a new one).
   * Static at the state's most readable moment; plays while hovered.
   */
  const thumbnail = ({ canvas, shape = 'circle', state = 'idle', face = 'neutral', body = '#cfcfd4', paper = '#18181a' }) => {
    const cv = canvas || document.createElement('canvas');
    if (!canvas) cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    const k = (cv.width * 0.36) / R;
    const draw = (t) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.translate(cv.width / 2, cv.height / 2);
      g.scale(k, k);
      B.drawFrame(g, B.sampleTimeline([[state, 6]], t, { shape, expression: face }), { bodyColor: body, eyeColor: paper, paper, scale: R });
    };
    const rest = B.POSES[state] ?? 1;
    const loopSeconds = (B.STATE_BY_ID.get(state)?.duration ?? 2.4) + 0.6;
    draw(rest);
    let raf = 0;
    let start = 0;
    const animate = (now) => { draw(((now - start) / 1000) % loopSeconds); raf = requestAnimationFrame(animate); };
    if (cv.__stop) cv.__stop();
    const onEnter = () => { start = performance.now(); raf = requestAnimationFrame(animate); };
    const onLeave = () => { cancelAnimationFrame(raf); draw(rest); };
    cv.addEventListener('mouseenter', onEnter);
    cv.addEventListener('mouseleave', onLeave);
    cv.__stop = () => { cancelAnimationFrame(raf); cv.removeEventListener('mouseenter', onEnter); cv.removeEventListener('mouseleave', onLeave); };
    return cv;
  };

  const pickerButton = (thumb, label, title, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.appendChild(thumb);
    const caption = document.createElement('span');
    caption.textContent = label;
    btn.appendChild(caption);
    btn.addEventListener('click', onClick);
    return btn;
  };

  // ------------------------------------------------------------ project panel

  const PROJECT_FIELDS = ['preset', 'cw', 'ch', 'fit', 'fx', 'fy', 'bg', 'duration', 'fps'];

  const syncProjectPanel = () => {
    for (const id of PROJECT_FIELDS) $(id).value = project[id];
    $('durationValue').textContent = `${project.duration} s`;
    $('customSize').hidden = project.preset !== 'custom';
    $('focusRow').hidden = project.fit !== 'cover' || !photo;
  };

  PROJECT_FIELDS.forEach((id) => $(id).addEventListener('input', () => {
    const el = $(id);
    project[id] = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    syncProjectPanel();
    applyCanvasSize();
    renderTimeline();
    persist();
    refresh();
  }));

  const setPhoto = (dataUrl) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { photo = img; photoData = dataUrl; applyCanvasSize(); syncProjectPanel(); refresh(); resolve(); };
    img.src = dataUrl;
  });

  $('photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  });

  $('scrub').addEventListener('input', () => {
    paused = true;
    scrubTime = +$('scrub').value;
    $('scrubValue').textContent = `${scrubTime.toFixed(2)} s`;
    renderFrame(scrubTime);
  });
  $('play').addEventListener('click', () => { paused = false; playStart = performance.now() - scrubTime * 1000; });
  $('pause').addEventListener('click', () => { scrubTime = currentTime(); paused = true; renderFrame(scrubTime); });

  // ---------------------------------------------------------------- bot list

  const select = (index) => {
    selected = index;
    renderBotList();
    renderSelection();
    persist();
    refresh();
  };

  const addBot = (shapeId) => {
    const label = B.SHAPE_BY_ID.get(shapeId).label;
    project.bots.push(newBot({
      name: `${label} ${project.bots.length + 1}`,
      shape: shapeId,
      color: PALETTE[2 + (project.bots.length % 8)],
      timeline: [['idle', project.duration]]
    }));
    select(project.bots.length - 1);
  };

  B.SHAPES.forEach((shape) => {
    $('shapePicker').appendChild(pickerButton(thumbnail({ shape: shape.id }), shape.label, `Add a ${shape.label.toLowerCase()}`, () => addBot(shape.id)));
  });

  const renderBotList = () => {
    const list = $('botList');
    list.innerHTML = '';
    project.bots.forEach((bot, i) => {
      const li = document.createElement('li');
      if (i === selected) li.className = 'selected';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = bot.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${bot.name} `;
      const small = document.createElement('small');
      small.textContent = (B.SHAPE_BY_ID.get(bot.shape)?.label || bot.shape) + (bot.visible === false ? ' · hidden' : '');
      name.appendChild(small);
      li.append(dot, name);
      li.addEventListener('click', () => select(i));
      list.appendChild(li);
    });
  };

  // ---------------------------------------------------------- selected bot

  /** input id -> bot field, with optional unit conversion. */
  const BOT_FIELDS = {
    botName:       { key: 'name' },
    botShape:      { key: 'shape' },
    botColor:      { key: 'color' },
    botEyeColor:   { key: 'eyeColor' },
    botBadgeColor: { key: 'badgeColor' },
    botX:          { key: 'x', number: true },
    botY:          { key: 'y', number: true },
    botSize:       { key: 'size', toUi: (v) => Math.round(v * 200) / 2, fromUi: (v) => v / 100, output: (v) => `${v}%` },
    botRotation:   { key: 'rotation', toUi: (v) => Math.round((v * 180) / Math.PI), fromUi: (v) => (v * Math.PI) / 180, output: (v) => `${v}°` },
    botFace:       { key: 'face' },
    botLook:       { key: 'look' },
    botLookYaw:    { key: 'lookYaw', number: true },
    botLookPitch:  { key: 'lookPitch', number: true },
    botLookMix:    { key: 'lookMix', toUi: (v) => Math.round(v * 100), fromUi: (v) => v / 100 },
    botVisible:    { key: 'visible', checkbox: true }
  };

  B.SHAPES.forEach((shape) => { const o = document.createElement('option'); o.value = shape.id; o.textContent = shape.label; $('botShape').appendChild(o); });
  FACE_IDS.forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = capitalise(id); $('botFace').appendChild(o); });
  PALETTE.forEach((hex) => { const o = document.createElement('option'); o.value = hex; $('palette').appendChild(o); });

  STATE_ORDER.forEach((state) => {
    const info = STATE_INFO[state];
    $('statePicker').appendChild(pickerButton(thumbnail({ state }), info.label, info.help, () => {
      const bot = project.bots[selected];
      if (!bot) return;
      bot.timeline.push([state, B.STATE_BY_ID.get(state).duration]);
      renderTimeline();
      persist();
      refresh();
    }));
  });

  const renderSelection = () => {
    const bot = project.bots[selected];
    $('noSelection').hidden = !!bot;
    $('selection').hidden = !bot;
    if (!bot) return;
    for (const [id, f] of Object.entries(BOT_FIELDS)) {
      const el = $(id);
      if (f.checkbox) el.checked = bot[f.key] !== false;
      else el.value = f.toUi ? f.toUi(bot[f.key] || 0) : (bot[f.key] ?? '');
      const out = $(`${id}Value`);
      if (out) out.textContent = f.output ? f.output(el.value) : el.value;
    }
    $('customLook').hidden = bot.look !== 'custom';
    thumbnail({ canvas: $('facePreview'), face: bot.face, body: '#cfcfd4', paper: '#161618' });
    renderTimeline();
  };

  Object.entries(BOT_FIELDS).forEach(([id, f]) => $(id).addEventListener('input', () => {
    const bot = project.bots[selected];
    if (!bot) return;
    const el = $(id);
    if (f.checkbox) bot[f.key] = el.checked;
    else if (f.fromUi) bot[f.key] = f.fromUi(+el.value);
    else if (f.number) bot[f.key] = +el.value;
    else bot[f.key] = el.value;
    const out = $(`${id}Value`);
    if (out) out.textContent = f.output ? f.output(el.value) : el.value;
    if (id === 'botFace') thumbnail({ canvas: $('facePreview'), face: bot.face, body: '#cfcfd4', paper: '#161618' });
    if (id === 'botLook') $('customLook').hidden = bot.look !== 'custom';
    if (id === 'botName' || id === 'botShape' || id === 'botColor' || id === 'botVisible') renderBotList();
    persist();
    refresh();
  }));

  $('botDuplicate').addEventListener('click', () => {
    if (selected < 0) return;
    const copy = JSON.parse(JSON.stringify(project.bots[selected]));
    copy.name += ' copy';
    copy.x += 0.05;
    copy.y += 0.05;
    project.bots.splice(selected + 1, 0, copy);
    select(selected + 1);
  });
  $('botDelete').addEventListener('click', () => {
    if (selected < 0) return;
    project.bots.splice(selected, 1);
    select(Math.min(selected, project.bots.length - 1));
  });
  $('botForward').addEventListener('click', () => {
    if (selected < 0 || selected >= project.bots.length - 1) return;
    [project.bots[selected], project.bots[selected + 1]] = [project.bots[selected + 1], project.bots[selected]];
    select(selected + 1);
  });
  $('botBack').addEventListener('click', () => {
    if (selected <= 0) return;
    [project.bots[selected], project.bots[selected - 1]] = [project.bots[selected - 1], project.bots[selected]];
    select(selected - 1);
  });

  // ----------------------------------------------------------------- timeline

  const renderTimeline = () => {
    const bot = project.bots[selected];
    const box = $('timeline');
    box.innerHTML = '';
    if (!bot) return;

    const control = (text, title, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', onClick);
      return b;
    };
    const commit = () => { renderTimeline(); persist(); refresh(); };

    bot.timeline.forEach((block, i) => {
      const row = document.createElement('div');
      row.className = 'block';

      const state = document.createElement('select');
      state.title = 'Animation';
      STATE_ORDER.forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = STATE_INFO[id].label; state.appendChild(o); });
      state.value = block[0];
      state.addEventListener('change', () => { block[0] = state.value; if (block[0] !== 'idle') block.length = 2; commit(); });

      const seconds = document.createElement('input');
      seconds.type = 'number';
      seconds.min = 0.1;
      seconds.step = 0.1;
      seconds.title = 'Seconds';
      seconds.value = block[1];
      seconds.addEventListener('change', () => { block[1] = Math.max(0.1, +seconds.value); commit(); });

      row.append(state, seconds);

      if (block[0] === 'idle') {
        const face = document.createElement('select');
        face.title = 'Face for this block';
        const def = document.createElement('option');
        def.value = '';
        def.textContent = `${capitalise(bot.face)} (default)`;
        face.appendChild(def);
        FACE_IDS.forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = capitalise(id); face.appendChild(o); });
        face.value = block[2] || '';
        face.addEventListener('change', () => { if (face.value) block[2] = face.value; else block.length = 2; persist(); refresh(); });
        row.appendChild(face);
      }

      row.append(
        control('↑', 'Move earlier', () => { if (i > 0) { [bot.timeline[i - 1], bot.timeline[i]] = [bot.timeline[i], bot.timeline[i - 1]]; commit(); } }),
        control('↓', 'Move later', () => { if (i < bot.timeline.length - 1) { [bot.timeline[i + 1], bot.timeline[i]] = [bot.timeline[i], bot.timeline[i + 1]]; commit(); } }),
        control('×', 'Remove', () => { bot.timeline.splice(i, 1); commit(); })
      );
      box.appendChild(row);
    });

    const total = bot.timeline.reduce((sum, block) => sum + block[1], 0);
    let note = `${total.toFixed(1)} s of ${project.duration} s.`;
    if (total < project.duration) note += ` The last block holds for the remaining ${(project.duration - total).toFixed(1)} s.`;
    if (total > project.duration) note += ' Blocks past the end are cut off.';
    $('timelineTotal').textContent = note;
  };

  // ------------------------------------------------------- canvas interaction

  const toCanvas = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * stage.width, y: ((e.clientY - r.top) / r.height) * stage.height };
  };

  /** Topmost bot under a canvas point, tested against its rest shape. */
  const hitTest = (pt) => {
    const width = stage.width;
    const height = stage.height;
    for (let i = project.bots.length - 1; i >= 0; i--) {
      const bot = project.bots[i];
      if (bot.visible === false) continue;
      const k = botScale(bot, width);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(bot.x * width, bot.y * height);
      ctx.rotate(bot.rotation || 0);
      ctx.scale(k, k);
      const inside = ctx.isPointInPath(new Path2D(B.shapePath(bot.shape)), pt.x, pt.y);
      ctx.restore();
      if (inside) return i;
    }
    return -1;
  };

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const pt = toCanvas(e);
    const i = hitTest(pt);
    if (i < 0) { select(-1); return; }
    select(i);
    const bot = project.bots[i];
    drag = { ox: pt.x - bot.x * stage.width, oy: pt.y - bot.y * stage.height };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || selected < 0) return;
    const pt = toCanvas(e);
    const bot = project.bots[selected];
    bot.x = +((pt.x - drag.ox) / stage.width).toFixed(3);
    bot.y = +((pt.y - drag.oy) / stage.height).toFixed(3);
    $('botX').value = bot.x;
    $('botY').value = bot.y;
    refresh();
  });
  const endDrag = () => { if (drag) { drag = null; stage.classList.remove('dragging'); persist(); } };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (!$('tutorial').hidden) return;
    const bot = project.bots[selected];
    if (!bot) return;
    const step = e.shiftKey ? 0.02 : 0.004;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft': bot.x -= step; break;
      case 'ArrowRight': bot.x += step; break;
      case 'ArrowUp': bot.y -= step; break;
      case 'ArrowDown': bot.y += step; break;
      case '[': bot.rotation = (bot.rotation || 0) - Math.PI / 36; break;
      case ']': bot.rotation = (bot.rotation || 0) + Math.PI / 36; break;
      case '-': bot.size = Math.max(0.04, bot.size - 0.01); break;
      case '=': case '+': bot.size += 0.01; break;
      case 'Delete': case 'Backspace': $('botDelete').click(); return;
      case 'd': case 'D': $('botDuplicate').click(); return;
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    bot.x = +bot.x.toFixed(3);
    bot.y = +bot.y.toFixed(3);
    renderSelection();
    persist();
    refresh();
  });

  // ------------------------------------------------------- export, save, load

  const setStatus = (message) => { $('status').textContent = message; };

  const download = (blob, filename) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  $('exportPng').addEventListener('click', () => {
    exporting = true;
    renderFrame(currentTime());
    stage.toBlob((blob) => { download(blob, 'bots.png'); exporting = false; refresh(); }, 'image/png');
  });

  const loadMuxer = () => new Promise((resolve) => {
    if (window.Mp4Muxer) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js';
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });

  /** Render every frame with WebCodecs and mux to MP4. Resolves to a Blob, or null if the browser can't. */
  async function exportMp4() {
    if (!('VideoEncoder' in window)) { setStatus('Video export needs Chrome (or another browser with WebCodecs).'); return null; }
    await loadMuxer();
    if (!window.Mp4Muxer) { setStatus('Could not load the MP4 muxer. Check your internet connection and try again.'); return null; }

    const fps = +project.fps || 30;
    const width = stage.width;
    const height = stage.height;
    const frames = Math.round(project.duration * fps);
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width, height }, fastStart: 'in-memory' });
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => console.error(e) });
    encoder.configure({ codec: 'avc1.640028', width, height, bitrate: 14_000_000, framerate: fps });

    const wasPaused = paused;
    paused = true;
    exporting = true;
    try {
      for (let i = 0; i < frames; i++) {
        renderFrame(i / fps);
        const frame = new VideoFrame(stage, { timestamp: Math.round((i / fps) * 1e6), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: i % 60 === 0 });
        frame.close();
        if (i % 10 === 0) { setStatus(`Rendering ${Math.round((100 * i) / frames)}%`); await new Promise((r) => setTimeout(r, 0)); }
        while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
      }
      await encoder.flush();
      encoder.close();
      muxer.finalize();
    } finally {
      exporting = false;
      paused = wasPaused;
      playStart = performance.now();
      refresh();
    }
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }

  $('exportVideo').addEventListener('click', async () => {
    $('exportVideo').disabled = true;
    try {
      const blob = await exportMp4();
      if (blob) { download(blob, 'bots.mp4'); setStatus(`Saved bots.mp4 (${(blob.size / 1e6).toFixed(1)} MB, ${project.duration} s, ${stage.width}×${stage.height})`); }
    } catch (e) {
      setStatus(`Export failed: ${e.message}`);
      console.error(e);
    }
    $('exportVideo').disabled = false;
  });

  $('saveProject').addEventListener('click', () => {
    download(new Blob([JSON.stringify({ version: 4, project, photo: photoData })], { type: 'application/json' }), 'bots-project.json');
  });
  $('loadProjectButton').addEventListener('click', () => $('loadProject').click());
  $('loadProject').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        project = data.project;
        if (data.photo) await setPhoto(data.photo);
        syncProjectPanel();
        select(project.bots.length ? 0 : -1);
        applyCanvasSize();
        setStatus('Project loaded.');
      } catch (err) {
        setStatus(`Could not read that project file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });

  // ----------------------------------------------------------------- tutorial

  const TUTORIAL = [
    { target: 'photo',        text: 'Start by choosing a photo. The canvas takes its shape.' },
    { target: 'stage',        text: 'Click a bot to select it. Drag it to move it, or press Delete to remove it.', before: () => { if (selected < 0 && project.bots.length) select(0); } },
    { target: 'shapePicker',  text: 'Add a new bot by clicking a shape. It appears in the middle of the canvas.' },
    { target: 'statePicker',  text: 'Give a bot animations: hover one to preview it, click to add it to the timeline.', before: () => { if (selected < 0 && project.bots.length) select(0); } }
  ];
  let tutorialStep = -1;
  let tutorialRaf = 0;

  const placeTutorial = () => {
    const step = TUTORIAL[tutorialStep];
    if (!step) return;
    const el = $(step.target);
    const r = el.getBoundingClientRect();
    const pad = 8;
    const spot = document.querySelector('#tutorial .spot');
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${r.top - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;
    // card to the right of the target, else to its left, else below it, else above it
    const card = document.querySelector('#tutorial .card');
    const cw = Math.min(280, window.innerWidth - 24);
    const ch = card.offsetHeight || 120;
    let left;
    let top;
    if (r.right + 16 + cw <= window.innerWidth - 12) { left = r.right + 16; top = r.top; }
    else if (r.left - 16 - cw >= 12) { left = r.left - 16 - cw; top = r.top; }
    else if (r.bottom + 12 + ch <= window.innerHeight - 12) { left = r.left; top = r.bottom + 12; }
    else { left = r.left; top = r.top - 12 - ch; }
    card.style.left = `${clamp(left, 12, window.innerWidth - cw - 12)}px`;
    card.style.top = `${clamp(top, 12, window.innerHeight - ch - 12)}px`;
    tutorialRaf = requestAnimationFrame(placeTutorial);
  };

  const showTutorialStep = (i) => {
    tutorialStep = i;
    const step = TUTORIAL[i];
    if (step.before) step.before();
    $('tutorial').hidden = false;
    document.querySelector('#tutorial .step').textContent = `Step ${i + 1} of ${TUTORIAL.length}`;
    document.querySelector('#tutorial .text').textContent = step.text;
    $('tutorialNext').textContent = i === TUTORIAL.length - 1 ? 'Done' : 'Next';
    $(step.target).scrollIntoView({ block: 'center' });
    cancelAnimationFrame(tutorialRaf);
    placeTutorial();
  };

  const endTutorial = () => {
    cancelAnimationFrame(tutorialRaf);
    $('tutorial').hidden = true;
    tutorialStep = -1;
    try { localStorage.setItem(TUTORIAL_KEY, 'seen'); } catch (e) { /* ignore */ }
  };

  $('tutorialNext').addEventListener('click', () => { if (tutorialStep >= TUTORIAL.length - 1) endTutorial(); else showTutorialStep(tutorialStep + 1); });
  $('tutorialSkip').addEventListener('click', endTutorial);
  $('showTutorial').addEventListener('click', () => showTutorialStep(0));

  const firstVisit = () => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch (e) { return false; } };

  // ------------------------------------------------------------------- boot

  /** Small scripting hook, handy for automation: botAnimator.sampleAt(3), botAnimator.exportMp4(). */
  window.botAnimator = {
    project: () => project,
    sampleAt: (t) => { paused = true; scrubTime = t; renderFrame(t); },
    play: () => { paused = false; playStart = performance.now(); },
    loadPhoto: setPhoto,
    exportMp4,
    tutorial: () => showTutorialStep(0)
  };

  loadSaved();
  syncProjectPanel();
  applyCanvasSize();
  renderBotList();
  renderSelection();
  requestAnimationFrame(tick);
  if (firstVisit()) setTimeout(() => showTutorialStep(0), 600);
})();
