# Grok Bot kit

**Use the editor in your browser: https://davidstor.github.io/grok-bot-editor/** (Chrome recommended; Export MP4 uses
Chrome's built-in video encoder. Your photo never leaves your computer.)

Unofficial fan tool. The bot engine is a port of [bloub](https://github.com/jeremy-prt/bloub) by Jérémy Perret (MIT),
whose shapes, eyes, states and timings were measured off x.ai's bot video. Not affiliated with x.ai.

Assets for posts about Grok Bot (xAI). Nothing here is an official download; the shapes were traced
from the inline SVG marks on https://x.ai/bot and the colours are the ones that page uses.

## What's inside

- `frame-template.html` — the look from Grok's Starship post (Sept 15, 2026). Your photo fills the frame, a crowd
  of bots sits around the edges with white capsule eyes that glance around and look at you. The clip opens buried
  in the black bot's eyes, zooms out, holds for 5 s (adjustable), zooms back in and lands on the exact opening
  frame, so it loops seamlessly. **Export MP4** renders it frame-exact at 30 fps (Chrome, needs internet once for
  the muxer). Pick your photo, click Export.
- `serve.py` — optional local server (`python3 serve.py`, then http://localhost:8765). Only needed if you want to
  script the page; double-clicking the HTML works on its own.
- `editor.html` (also served as `index.html`) — the editor, now built on `bloub-engine.js`, a plain-JS port of
  [bloub](https://github.com/jeremy-prt/bloub) (MIT, Jérémy Perret). That means the bots are bloub's: 8 customiser
  shapes plus the 3 silhouettes measured off the x.ai video, eyes projected on a sphere with the measured head
  pose, 14 measured states (idle, thinking, wink, wide, alert, notify, exclaim, sleep, egg, hexagon, play, orbit,
  burst, comet) and 16 rest faces (neutral, attentive, surprised, excited, happy, laughing, angry, sad, scared,
  suspicious, confused, curious, proud, shy, unimpressed, sleepy). Spawn, drag, resize, rotate, recolour, give
  each bot a timeline (idle blocks can carry a face), point its gaze, export a frame-exact MP4, save/load projects.
- `bloub-engine.js` — the engine port on its own, if you want to use it elsewhere. `Bloub.sampleTimeline(blocks, t, opts)`
  returns a frame; `Bloub.drawFrame(ctx, frame, colours)` paints it on a canvas.
- `trio-template.html` — three bots over your full photo, each running a state timeline (idle, sleep, wink, wide,
  surprised, thinking, notification). Positions, sizes, colours and the timeline are one JSON block in the page;
  scrub to preview any second, Export MP4 for a frame-exact render.
- `orbit-template.html` — the Galaxy-stream look: dark background, bots circling your photo. Open in Chrome. Pick your photo, tweak the orbit, click **Record video**.
  Saves .mp4 where the browser supports it (Chrome on macOS does), otherwise .webm (LinkedIn accepts both).
  Or just screen-record the canvas with ⌘⇧5.
- `svg/` — 81 static bots: 3 official-traced head shapes × 9 official colours × 3 eye styles
  (`dark`, `white`, `cutout`). Drop into Canva, Figma, Keynote, CapCut, etc.
- `bot-paths.json` / `bot-paths.js` — the raw path data (viewBox `-15 -15 259 259`) if you want to build your own.

Shapes: `blob` (the main mark), `triangle`, `gem` (rounded diamond). The template also offers hexagon,
squircle, droplet and capsule; those four are approximations of shapes seen in the Galaxy stream, not traced.

Light-theme colours (sampled from the Starship post video): purple #9159FE, yellow #FF9800, blue #1084FE,
black #000000, teal #00BCA6, orange #FF6700, background #F7F7F7.

Dark-theme colours (from x.ai/bot): teal #54B9A6, purple #885CF5, indigo #6464EF, blue #3C82F6, green #5BC67A,
yellow #F19D38, orange #ED712E, red #EA4045, pink #EB4699.

## Trademark note

xAI's brand guidelines (https://x.ai/legal/brand-guidelines) say their marks may be used only to refer to
xAI/Grok accurately, not to imply endorsement or as part of your own branding. A personal post saying
"I've been using Grok Bot" with the bots as decoration is the kind of referential use that's normally fine;
don't put them in a logo, product name or anything that looks like an xAI partnership. Official logo pack
(the Grok/xAI wordmarks, not the bots): https://data.x.ai/logos/SpaceXAI_Grok_Assets.zip

## What other creators are using

- xAI's own designer (John Bai, "Designing Grok Bot with Grok Bot") animates the real production spec file in a
  localhost playground built by a Grok Bot named Motion God, plus Figma for static work. Not public.
- bloub (MIT) — https://bloub.vercel.app — free, no login. The editor above is built on a port of its engine. 8 shapes, 16 expressions, 14 animation states measured
  frame by frame from xAI's video; exports SVG/PNG/GIF/MP4. Source: https://github.com/jeremy-prt/bloub
- blooby — https://blooby-editor.vercel.app (needs an account) — multi-character scenes, gaze/look tool, Lottie,
  dotLottie state machines, GIF/MP4. Source (MIT): https://github.com/divyanshu-patil/blooby
- Grok_bot studio (MIT) — https://github.com/Eyadkelleh/Grok_bot — bloub clone, PNG/GIF/MP4.
- agent-robot-avatar (CX-ArtLab) — https://github.com/CX-ArtLab/agent-robot-avatar — blink, pointer-following, jelly drag.
- cartoon-eyes (React) — https://github.com/tmrk/cartoon-eyes — eyes that blink, wander or follow the cursor.
- Dmitry Lepisov's interactive 3D robot was made in Spline + Omma Studio.
- forbotsonly measured the official eye geometry: slanted stadiums, about 6.5×15 at 24° tilt, knocked out of the body.

## Other tools worth knowing

- bloub (MIT) — https://bloub.vercel.app — 8 shapes, 16 expressions, 14 animation states, exports SVG/PNG/GIF/MP4.
  Source: https://github.com/jeremy-prt/bloub
- Grok_bot studio (MIT) — https://github.com/Eyadkelleh/Grok_bot — bloub-parity, exports PNG/GIF/MP4.
