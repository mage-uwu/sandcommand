import { ACTOR_H, ACTOR_W, CHUNK_COUNT, GRAVITY, TICK_RATE } from '../shared/constants.ts';
import { applyCarve } from '../shared/particles.ts';
import { CallKind, PROTOCOL_VERSION, quantizeAim } from '../shared/protocol.ts';
import { ENGINE_NOZZLE_Y, ENGINE_X, SHIP_H, SHIP_W, ShipPart, hasShipPart, shipPoint } from '../shared/dropship.ts';
import { LASER_MIN, PROJ, ProjKind, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { F_ALIVE, Team } from '../shared/protocol.ts';
import { SMG_SPEED, TANK_W, TANK_H, gunPivotY, isPet, isSpider, tankCoreY, tankW } from '../shared/tank.ts';
import { ASSIST_CONE, ASSIST_RANGE, type AssistTarget, MOUSE_LOCK_BREAK, assistAim, autoTarget, ballisticAim } from './aim.ts';
import { scopeLock } from './scope.ts';
import { Music } from './music.ts';
import { Sfx } from './sfx.ts';
import { BTN_FIRE, BTN_LOCK, STANCE_H, shoulderAt } from '../shared/actor.ts';
import { BuildResult, PIECES, snapPiece } from '../shared/build.ts';
import { Game } from './game.ts';
import { InputState } from './input.ts';
import { Net } from './net.ts';
import { Renderer } from './render.ts';
import { TouchControls } from './touch.ts';
import { touchPulses, wheelMayFire } from './stick.ts';
import { registerServiceWorker, setupInstall, takeRejoin, watchForUpdates } from './pwa.ts';

const snapAt = { x: 0, y: 0 };

const TICK_MS = 1000 / TICK_RATE;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const overlay = $<HTMLDivElement>('overlay');
const nameInput = $<HTMLInputElement>('name');
const playBtn = $<HTMLButtonElement>('play');
const statusEl = $<HTMLDivElement>('status');
const roomsEl = $<HTMLDivElement>('rooms');
const chatInput = $<HTMLInputElement>('chat');

const input = new InputState(canvas);
const renderer = new Renderer(canvas);
const touch = new TouchControls(canvas, input, {
  chat: () => input.onChatKey?.(),
  overUi: (x, y) => (!!game?.building && renderer.menuHit(x, y) >= 0) || (!!game?.calling && renderer.callMenuHit(x, y) >= 0),
  // Building, the radio menu up, or out of the wave: taps on the right act on the spot touched.
  pointMode: () => !game || !game.alive || game.building || game.calling,
});
let game: Game | null = null;
let net: Net | null = null;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode); not important
  }
}

nameInput.value = storageGet('sc.name') ?? `Clone${Math.floor(Math.random() * 900 + 100)}`;

async function refreshRooms(): Promise<void> {
  try {
    const rooms = (await (await fetch('/api/rooms')).json()) as { room: string; players: number }[];
    // One match for everyone: how many humans are in it.
    const n = rooms.reduce((s, r) => s + r.players, 0);
    roomsEl.textContent = n ? `${n}/64 in the match` : 'Nobody in yet. Bots will keep you company.';
  } catch {
    roomsEl.textContent = '';
  }
}
refreshRooms();

// The soundtrack and sound effects start on Deploy (browsers only allow
// audio after a click); M mutes everything, N toggles just the effects, and
// the choices are remembered.
let music: Music | null = null;
let sfx: Sfx | null = null;
let musicMuffled = false;
let muted = storageGet('sc.mute') === 'on';
/** Mute or unmute everything: music and effects share one audio context, which is paused outright. */
function applyMute(): void {
  sfx?.setMuted(muted);
  const ctx = music?.ctx as AudioContext | undefined;
  if (!ctx) return;
  (muted ? ctx.suspend?.() : ctx.resume?.())?.catch(() => {});
}
function startMusic(): void {
  if (music) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    music = new Music(new Ctx());
    // Songs take turns: say which one's on.
    music.onSong = (name) => game?.feed.push({ text: `♪ now playing: ${name}`, color: '#b8a0ff', at: performance.now() });
    music.start();
    sfx = new Sfx(music.ctx);
    if (storageGet('sc.sfx') === 'off') sfx.toggle();
    if (game) game.sfx = sfx;
    applyMute();
  } catch {
    music = null; // no audio here: play on in silence
    sfx = null;
  }
}
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyM' || input.typing || e.repeat) return;
  startMusic();
  muted = !muted;
  storageSet('sc.mute', muted ? 'on' : 'off');
  applyMute();
  game?.feed.push({ text: muted ? 'all sound muted (M)' : 'sound on (M)', color: '#b8a0ff', at: performance.now() });
});
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyN' || input.typing || e.repeat) return;
  startMusic();
  if (!sfx) return;
  if (muted) {
    // (Unmuting with N: bring the sound back, effects on.)
    muted = false;
    storageSet('sc.mute', 'off');
    applyMute();
    if (storageGet('sc.sfx') !== 'off') {
      game?.feed.push({ text: 'sound on (N)', color: '#b8a0ff', at: performance.now() });
      return;
    }
  }
  const on = sfx.toggle();
  storageSet('sc.sfx', on ? 'on' : 'off');
  game?.feed.push({ text: on ? 'sound effects on (N)' : 'sound effects off (N)', color: '#b8a0ff', at: performance.now() });
});

async function join(): Promise<void> {
  startMusic();
  if (touch.enabled) {
    // Phones: play fullscreen and sideways where the browser allows it.
    document.documentElement.requestFullscreen?.().catch(() => {});
    (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
  }
  const name = nameInput.value.trim().slice(0, 16);
  storageSet('sc.name', name);
  playBtn.disabled = true;
  // There's one match, and everyone joins it.
  const room = 'main';
  statusEl.textContent = 'Connecting…';
  const g = new Game();
  g.sfx = sfx;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`;
  net?.close();
  net = new Net(url, {
    welcome(w) {
      if (w.version !== PROTOCOL_VERSION) {
        // The server was redeployed under this tab: this client can't read its
        // frames (e.g. rockets it has never heard of). Fetch the new client,
        // at most once per session so a bad deploy can't reload-loop.
        let tried = false;
        try {
          tried = sessionStorage.getItem('sc-reload') === String(w.version);
          sessionStorage.setItem('sc-reload', String(w.version));
        } catch {}
        if (!tried) {
          try {
            sessionStorage.setItem('sc.rejoin', '1'); // (and straight back in: pwa.ts)
          } catch {}
          location.reload();
          return;
        }
        showOverlay('The game was updated. Reload the page to play.');
        return;
      }
      if (new URLSearchParams(location.search).has('debug')) {
        // Debug only: `carve` runs the client's R_CARVE path locally (the
        // server never hears about it, so that chunk desyncs until resent).
        const removed: number[] = [];
        const detached: number[] = [];
        const carve = (x: number, y: number, r: number) => {
          applyCarve(g.terrain, x, y, r, 0, removed, detached);
          g.carved(x, y, r, 1, 0, removed, detached);
          return detached.length / 3;
        };
        (window as unknown as { sc: unknown }).sc = { game: g, renderer, input, carve, mark, targets: () => assistTargets(g) };
      }
      g.myId = w.id;
      g.room = w.room;
      game = g;
      overlay.classList.add('hidden');
      touch.setVisible(true);
      const q = new URLSearchParams(location.search);
      q.set('room', w.room);
      history.replaceState(null, '', `?${q}`);
    },
    frame(tick, ack, r) {
      try {
        g.applyFrame(tick, ack, r);
        // A regenerated map chunk that differs from the server's: fetch the real one.
        if (g.resyncWanted.length) {
          net?.resync(g.resyncWanted.splice(0));
        }
      } catch (err) {
        // A corrupt frame leaves terrain in an unknown state: ask for fresh chunks.
        console.error('frame decode failed', err);
        const all: number[] = [];
        for (let i = 0; i < CHUNK_COUNT; i++) if (g.loaded[i]) all.push(i);
        net?.resync(all);
      }
    },
    reject(reason) {
      showOverlay(`Rejected: ${reason}`);
    },
    closed(reason) {
      if (game === g) showOverlay(`Disconnected: ${reason}`);
      else showOverlay(`Could not join: ${reason}`);
      game = null;
    },
  });
}

function showOverlay(msg: string): void {
  overlay.classList.remove('hidden');
  touch.setVisible(false);
  statusEl.textContent = msg;
  playBtn.disabled = false;
  refreshRooms();
}

playBtn.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

// The installed app (pwa.ts): online-only service worker, the menu's
// Install button, and reloading onto a newer build when one goes live (on
// the menu, or dead and waiting, never mid-fight), straight back in.
registerServiceWorker();
setupInstall($('install'), $<HTMLButtonElement>('installBtn'), $('installHint'));
watchForUpdates(
  () => !game || (!game.alive && !game.ride && !game.myCraft()),
  () => !!game,
);
if (takeRejoin()) join();

// Chat.
input.onChatKey = () => {
  if (!game) return;
  input.typing = true;
  chatInput.classList.remove('hidden');
  chatInput.focus();
};
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (text) net?.chat(text);
  }
  if (e.key === 'Enter' || e.key === 'Escape') {
    chatInput.value = '';
    chatInput.blur();
  }
});
chatInput.addEventListener('blur', () => {
  input.typing = false;
  chatInput.classList.add('hidden');
});

/**
 * What the aim assist may snap onto: enemy clones in view, driven tanks,
 * and enemy dropships (their hull, and each engine pod still on its pylon,
 * so aiming near a pod picks that pod). Never teammates or their gear.
 */
const podPt = { x: 0, y: 0 };
function assistTargets(g: Game): AssistTarget[] {
  const out: AssistTarget[] = [];
  const mine = g.myTeam;
  const foe = (id: number) => id !== g.myId && (mine === Team.None || g.teamOf[id] !== mine);
  for (const s of g.shipViews()) {
    if (s.owner === g.myId || (mine !== Team.None && s.team === mine)) continue;
    for (let e = 0; e < 4; e++) {
      if (!hasShipPart(s.parts, ShipPart.EngineA + e)) continue;
      const q = shipPoint(s, ENGINE_X[e], ENGINE_NOZZLE_Y - 4, podPt);
      out.push({ x: q.x, y: q.y, vx: s.vx, vy: s.vy, g: 1000 + s.slot });
    }
    out.push({ x: s.x + SHIP_W / 2, y: s.y + SHIP_H / 2, vx: s.vx, vy: s.vy, g: 1000 + s.slot, core: true });
  }
  for (const v of g.remoteViews()) {
    if (!(v.flags & F_ALIVE) || g.tankPilots.has(v.id) || !foe(v.id)) continue;
    // Two targets per clone, the head on its own (aim a touch high for the
    // headshot) and centre mass; crouched or prone, both sit lower.
    const h = STANCE_H[v.stance] ?? ACTOR_H;
    const top = v.y + ACTOR_H - h;
    out.push({ x: v.x + ACTOR_W / 2, y: top + 1.5, vx: v.vx, vy: v.vy, g: v.id });
    out.push({ x: v.x + ACTOR_W / 2, y: top + h * 0.5, vx: v.vx, vy: v.vy, g: v.id, core: true });
  }
  for (const t of g.tankViews()) {
    // A tank by its driver; a watchdog or tarantula by its owner, driven or not.
    const who = isPet(t) ? t.owner : t.pilot;
    if (who !== 255 && foe(who)) out.push({ x: t.x + tankW(t) / 2, y: tankCoreY(t), vx: t.vx, vy: t.vy, g: 2000 + t.slot, core: true });
  }
  return out;
}

/** Terrain-free line of sight (3-cell steps, ignoring the first few cells at the muzzle end). */
function clearLine(g: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(d / 3);
  for (let i = 2; i < n; i++) {
    const t = i / n;
    if (g.terrain.isSolid(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false;
  }
  return true;
}
/** Tools aimed at the ground or at friends (or nothing): no snapping onto enemies. */
const NO_ASSIST = new Set<number>([WeaponId.Digger, WeaponId.Materializer, WeaponId.Radio, WeaponId.RepairKit, WeaponId.Idol, WeaponId.Mine]);
/** Touch auto mode (the AUTO button): on unless switched off, and the choice is remembered. */
input.autoMode = storageGet('sc.auto') !== 'off';
touch.setAuto(input.autoMode, (on) => storageSet('sc.auto', on ? 'on' : 'off'));
/** I: the info panel (humans online, net stats, kill feed), hidden by default; the choice is remembered. */
input.showInfo = storageGet('sc.info') === 'on';
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyI' || input.typing || e.repeat) return;
  input.showInfo = !input.showInfo;
  storageSet('sc.info', input.showInfo ? 'on' : 'off');
});
/** What the aim assist was snapped onto last tick (it stays on it while it reasonably can). */
let lastG: number | undefined;
/** The last arrow-key direction (a new one is a deliberate pick of target). */
const lastKey = { x: 0, y: 0 };
/** Lock first: ticks the first round waits for a fresh lock to settle (~0.1 s), and how many are left; whether the fire pad was down last tick. */
const LOCK_TICKS = 3;
let lockGate = 0;
let stickWas = false;
/** How far auto mode looks for a target with this weapon: about as far as its shots carry (and no further than the assist reaches). */
function autoRange(weapon: number): number {
  const def = WEAPONS[weapon];
  if (!def) return 0;
  if (def.proj < 0) return weapon === WeaponId.Laser ? ASSIST_RANGE : 0;
  return Math.min(ASSIST_RANGE, ((PROJ[def.proj].life * def.speed) / TICK_RATE) * 0.85);
}
/** Mouse aim assist: on unless switched off (V), and the choice is remembered. */
let mouseAssist = storageGet('sc.assist') !== 'off';
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyV' || input.typing || e.repeat) return;
  mouseAssist = !mouseAssist;
  storageSet('sc.assist', mouseAssist ? 'on' : 'off');
  game?.feed.push({ text: mouseAssist ? 'aim assist on (V)' : 'aim assist off (V)', color: '#b8a0ff', at: performance.now() });
});
// P: take remote control of our dropship (or hand it back to the autopilot).
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyP' || input.typing || e.repeat || !game || !net) return;
  if (game.pilot < 0 && game.rc < 0 && !game.shipViews().some((v) => v.owner === game!.myId && !v.leaving) && !game.myDog()) {
    game.feed.push({ text: 'no dropship or watchdog of yours to drive (call one in by radio)', color: '#b8a0ff', at: performance.now() });
    return;
  }
  net.call(CallKind.Pilot);
});
let pulse = 0;
/** Where the assist snapped this tick (for the target marker). */
const mark: { x: number; y: number; vx: number; vy: number; g?: number; on: boolean } = { x: 0, y: 0, vx: 0, vy: 0, on: false };
const shoulderPt = { x: 0, y: 0 };

// Main loop: fixed 30 Hz simulation/input ticks, render every animation frame.
let acc = 0;
let last = performance.now();
function frame(now: number): void {
  renderer.resize();
  acc += Math.min(250, now - last);
  last = now;
  const g = game;
  // The music goes muffled, as if through a wall, while we aren't out there fighting.
  const muffled = !g || !g.alive;
  if (music && muffled !== musicMuffled) {
    musicMuffled = muffled;
    music.setMuffled(muffled);
  }
  if (g && net) {
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      const dpr = canvas.width / innerWidth;
      // Arrow keys pick an aim direction from the clone (keyboard-only aim).
      const kx = g.drive ? g.drive.x + TANK_W / 2 : g.body.x + ACTOR_W / 2;
      const ky = g.drive ? g.drive.y + TANK_H / 3 : g.body.y + ACTOR_H / 3;
      input.stepKeyAim(
        TICK_MS / 1000,
        ((kx - renderer.camX) * renderer.zoom) / dpr + innerWidth / 2,
        ((ky - renderer.camY) * renderer.zoom) / dpr + innerHeight / 2,
        innerWidth,
        innerHeight,
      );
      const wx = renderer.camX + (input.mouseX * dpr - canvas.width / 2) / renderer.zoom;
      const wy = renderer.camY + (input.mouseY * dpr - canvas.height / 2) / renderer.zoom;
      // Aim from the shoulder, wherever the stance puts it (crouched, prone).
      const sh = shoulderAt(g.body.x, g.body.y, g.body.stance, wx < g.body.x + ACTOR_W / 2, shoulderPt);
      // Flying our dropship: aim from the ship (its turrets), not the clone.
      const flying = g.pilotedShip();
      // Driving our watchdog by remote: aim from its turret.
      const dogged = flying ? null : g.remoteDog();
      let ox = flying ? flying.x + SHIP_W / 2 : dogged ? dogged.x + tankW(dogged) / 2 : sh.x;
      let oy = flying ? flying.y + SHIP_H / 2 : dogged ? gunPivotY(dogged) : sh.y;
      let aim: number;
      mark.on = false;
      // Scoped, the assist reaches as far as the scope sees.
      const scopeReach = input.scoping ? 2000 : 0;
      const st = input.aimStick;
      // Touch auto mode: no thumb on the fire pad, so the gun finds the
      // nearest enemy in sight by itself and stays on it: locked on, ready
      // for your thumb (it never fires for you).
      // What the aim was locked onto coming into this tick.
      const heldG = lastG;
      const auto =
        input.touch && input.autoMode && !st && !input.pointAssist && g.alive && !g.drive && !flying && !dogged && !g.building && !g.calling && !NO_ASSIST.has(g.weapon)
          ? autoTarget(ox, oy, assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1), autoRange(g.weapon), lastG)
          : null;
      if (auto) {
        aim = Math.atan2(auto.t.y - oy, auto.t.x - ox);
        mark.x = auto.t.x;
        mark.y = auto.t.y;
        mark.vx = auto.t.vx ?? 0;
        mark.vy = auto.t.vy ?? 0;
        mark.g = auto.g;
        mark.on = true;
        const r = Math.min(innerWidth, innerHeight) * 0.3;
        input.mouseX = ((ox - renderer.camX) * renderer.zoom) / dpr + innerWidth / 2 + Math.cos(aim) * r;
        input.mouseY = ((oy - renderer.camY) * renderer.zoom) / dpr + innerHeight / 2 + Math.sin(aim) * r;
      } else if (st && (st.dx !== 0 || st.dy !== 0)) {
        // Touch fire pad: aim along it (assisted), and park the pointer out
        // along the aim so the crosshair, the arm and the camera follow. A tap
        // or a hold stays on the target it's locked onto (anywhere it's
        // roughly that way); a swipe picks a new one, the way it swiped.
        aim = assistAim(ox, oy, Math.atan2(st.dy, st.dx), assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1), Math.max(ASSIST_RANGE, scopeReach), mark, st.swipe ? undefined : lastG, ASSIST_CONE);
        st.swipe = false;
        const r = Math.min(innerWidth, innerHeight) * 0.3;
        input.mouseX = ((ox - renderer.camX) * renderer.zoom) / dpr + innerWidth / 2 + Math.cos(aim) * r;
        input.mouseY = ((oy - renderer.camY) * renderer.zoom) / dpr + innerHeight / 2 + Math.sin(aim) * r;
      } else {
        aim = Math.atan2(wy - oy, wx - ox);
        const kd = input.keyDir;
        // Arrow keys: the direction they point, snapped onto the enemy nearest that way.
        // (Held, it stays on its target; a new direction is a deliberate pick.)
        if (kd) aim = assistAim(ox, oy, Math.atan2(kd.y, kd.x), assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1), Math.max(ASSIST_RANGE, scopeReach), mark, kd.x === lastKey.x && kd.y === lastKey.y ? lastG : undefined, ASSIST_CONE);
        // (A tap on a spot is a deliberate pick too.)
        else if (input.pointAssist) aim = assistAim(ox, oy, aim, assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1), Math.max(ASSIST_RANGE, scopeReach), mark);
        else if (mouseAssist && !g.drive && (flying || dogged || !NO_ASSIST.has(g.weapon))) {
          // Mouse: snaps onto an enemy loosely under the line, out as far as the pointer reaches.
          const reach = Math.max(scopeReach, Math.min(900, Math.max(ASSIST_RANGE, Math.hypot(wx - ox, wy - oy) + 80)));
          // Locked on, it stays on them until the mouse swings well off them.
          aim = assistAim(ox, oy, aim, assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1), reach, mark, lastG, MOUSE_LOCK_BREAK);
        }
      }
      lastKey.x = input.keyDir?.x ?? 0;
      lastKey.y = input.keyDir?.y ?? 0;
      // (What it's on now: next tick's assist stays on it while it reasonably can.)
      lastG = mark.on ? mark.g : undefined;
      const raw = Math.atan2(wy - oy, wx - ox);
      // Scoped onto someone: the aim locks onto them.
      aim = scopeLock(g, ox, oy, aim, input.scoping && g.alive && !g.drive && !flying && !dogged ? (WEAPONS[g.weapon]?.lockCone ?? 0) : 0);
      // Locked or assisted onto someone: the arm and the aim line show the snap.
      g.lockAim = g.scopeLock || Math.abs(aim - raw) > 1e-4 ? aim : null;
      // The little target on what we're snapped to: the scope's lock (a clone) if any, else the assist's pick.
      const locked = g.scopeLock ? g.remoteViews().find((v) => v.id === g.scopeLock!.id) : undefined;
      const tgt = locked ? { x: locked.x + g.scopeLock!.lx, y: locked.y + g.scopeLock!.ly, vx: locked.vx, vy: locked.vy } : mark.on && g.alive ? { x: mark.x, y: mark.y, vx: mark.vx, vy: mark.vy } : null;
      g.aimMark = tgt ? { x: tgt.x, y: tgt.y } : null;
      // Snapped onto someone on the other side of us from the pointer: the
      // clone turns to face them, and (as the server does, by the aim) the
      // shot leaves from the shoulder on that side. Aim from there, so the
      // shot goes down the very line the laser shows.
      if (tgt && !flying && !dogged) {
        const left = tgt.x < g.body.x + ACTOR_W / 2;
        if (left !== wx < g.body.x + ACTOR_W / 2) {
          const s2 = shoulderAt(g.body.x, g.body.y, g.body.stance, left, shoulderPt);
          ox = s2.x;
          oy = s2.y;
        }
      }
      if (tgt) {
        // Lead it: aim where it will be when the shot gets there, and for a
        // shot that falls (a GL bomb, a grenade), along the arc that lands on it.
        const def = WEAPONS[g.weapon];
        // (A tarantula's laser is a beam: straight there, no leading.)
        const beam = !!dogged && isSpider(dogged);
        const proj = flying ? ProjKind.ShipGun : beam ? -1 : dogged ? ProjKind.TankBullet : (def?.proj ?? -1);
        const speed = flying ? 900 : beam ? 1e6 : dogged ? SMG_SPEED : (def?.speed ?? 0);
        const own = flying ? { vx: flying.vx * 0.3, vy: flying.vy * 0.3 } : dogged ? { vx: dogged.vx * 0.25, vy: dogged.vy * 0.25 } : { vx: g.body.vx * 0.25, vy: g.body.vy * 0.25 };
        const b = ballisticAim(ox, oy, tgt, speed, proj >= 0 ? GRAVITY * PROJ[proj].gravity : 0, own, flying ? 9 : dogged ? 0 : (def?.muzzle ?? 0));
        if (b) aim = b.aim;
        else aim = Math.atan2(tgt.y - oy, tgt.x - ox);
        g.aimReach = b?.reach ?? true;
        g.lockAim = aim;
      }
      // A quick tap with the laser: held just long enough to fire its least
      // charge (a tap is otherwise two ticks of trigger, too short to charge).
      if (input.tapFire === 2 && g.weapon === WeaponId.Laser) input.tapFire = LASER_MIN + 2;
      let buttons = input.buttons();
      // Lock first: a thumb coming down on the fire pad locks on before a
      // round goes (a target not already locked waits a moment for the lock
      // to settle and the scope to get there; one already locked, by auto
      // mode or before, fires at once). A quick tap's shot waits with it.
      // The same when a held thumb sweeps (or swipes) onto someone new.
      stickWas = !!st;
      if (st && mark.on && mark.g !== heldG) lockGate = LOCK_TICKS;
      const gated = lockGate > 0;
      if (gated) {
        lockGate--;
        buttons &= ~BTN_FIRE;
      }
      // The fire pad only fires locked on: sweep it around and it just aims,
      // no spraying, until it lands on someone (then lock first, and fire).
      // Grenades, the digger and the tools (aimed at ground, walls or
      // friends) fire wherever it points; so do a tank's guns.
      const wheel = input.touch && (!!st?.fire || input.tapFire > 0);
      const lockedOn = !!tgt && g.lockAim !== null;
      if (wheel && !wheelMayFire(g.weapon, lockedOn, !!g.drive)) buttons &= ~BTN_FIRE;
      touch.setLocked(lockedOn);
      // Locked on (assist or scope): the server holds the muzzle on the target, shots down the sight line.
      if (tgt && g.lockAim !== null) buttons |= BTN_LOCK;
      // Touch: a thumb can't click a semi-automatic as fast as it cycles, so
      // a held trigger pulses (fire on alternate ticks) and the gun keeps going.
      // (Not the laser: holding is its charge.)
      if (input.touch && buttons & BTN_FIRE && !g.drive && touchPulses(WEAPONS[g.weapon]) && (pulse++ & 1)) buttons &= ~BTN_FIRE;
      if (input.tapFire > 0 && !gated) input.tapFire--;
      // Inventory: rotate, pick up, drop.
      g.cycle(input.takeCycle());
      if (input.takePickup()) g.pickUp();
      if (input.takeDrop()) g.drop();
      input.building = g.building;
      input.driving = !!g.drive;
      const n = net;
      // Materializer: a click on the menu picks a piece; a click in the world
      // asks the server to build it there (it checks the same rules the
      // preview shows).
      const click = input.takeClick();
      // Radio in hand: a click on its menu calls in a dropship or a tank.
      if (click && g.calling) {
        const kind = renderer.callMenuHit(input.mouseX, input.mouseY);
        if (kind >= 0) n.call(kind);
      }
      if (click && g.building && !flying) {
        const hit = renderer.menuHit(input.mouseX, input.mouseY);
        if (hit >= 0) input.piece = hit;
        else {
          const piece = PIECES[input.piece];
          const at = snapPiece(piece, wx, wy, snapAt);
          if (g.canBuildHere(input.piece, at.x, at.y) === BuildResult.Ok) n.build(input.piece, at.x, at.y);
        }
      }
      if ((g.building || g.calling) && !flying) buttons &= ~BTN_FIRE;
      const inv = g.invByte();
      g.localTick(buttons, quantizeAim(aim), (seq) => n.input(seq, buttons, quantizeAim(aim), inv));
    }
    renderer.draw(g, input, net, acc / TICK_MS);
  } else {
    acc = 0;
    renderer.drawIdle();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
