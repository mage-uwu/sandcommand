import { ACTOR_H, ACTOR_W, CHUNK_COUNT, TICK_RATE } from '../shared/constants.ts';
import { applyCarve } from '../shared/particles.ts';
import { PROTOCOL_VERSION, quantizeAim } from '../shared/protocol.ts';
import { WEAPONS } from '../shared/weapons.ts';
import { F_ALIVE, Team } from '../shared/protocol.ts';
import { TANK_W, TANK_H } from '../shared/tank.ts';
import { assistAim } from './aim.ts';
import { scopeLock } from './scope.ts';
import { Music } from './music.ts';
import { BTN_FIRE, shoulderAt } from '../shared/actor.ts';
import { BuildResult, PIECES, snapPiece } from '../shared/build.ts';
import { Game } from './game.ts';
import { InputState } from './input.ts';
import { Net } from './net.ts';
import { Renderer } from './render.ts';
import { TouchControls } from './touch.ts';

const snapAt = { x: 0, y: 0 };

const TICK_MS = 1000 / TICK_RATE;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const overlay = $<HTMLDivElement>('overlay');
const nameInput = $<HTMLInputElement>('name');
const roomInput = $<HTMLInputElement>('room');
const playBtn = $<HTMLButtonElement>('play');
const statusEl = $<HTMLDivElement>('status');
const roomsEl = $<HTMLDivElement>('rooms');
const chatInput = $<HTMLInputElement>('chat');

const input = new InputState(canvas);
const renderer = new Renderer(canvas);
const touch = new TouchControls(canvas, input, { chat: () => input.onChatKey?.(), overUi: (x, y) => renderer.menuHit(x, y) >= 0 });
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
roomInput.value = new URLSearchParams(location.search).get('room') ?? '';

async function refreshRooms(): Promise<void> {
  try {
    const rooms = (await (await fetch('/api/rooms')).json()) as { room: string; players: number }[];
    roomsEl.textContent = rooms.length
      ? rooms.map((r) => `${r.room}: ${r.players}/64`).join('   ')
      : 'No matches running. Yours will be the first.';
  } catch {
    roomsEl.textContent = '';
  }
}
refreshRooms();

// The soundtrack starts on Deploy (browsers only allow audio after a click);
// M toggles it, and the choice is remembered.
let music: Music | null = null;
let musicMuffled = false;
function startMusic(): void {
  if (music) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    music = new Music(new Ctx());
    if (storageGet('sc.music') === 'off') music.toggle();
    (music.ctx as AudioContext).resume?.().catch(() => {});
    music.start();
  } catch {
    music = null; // no audio here: play on in silence
  }
}
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyM' || input.typing || e.repeat) return;
  startMusic();
  if (!music) return;
  const on = music.toggle();
  storageSet('sc.music', on ? 'on' : 'off');
  game?.feed.push({ text: on ? '♪ music on (M)' : '♪ music off (M)', color: '#b8a0ff', at: performance.now() });
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
  statusEl.textContent = 'Finding a match…';
  let room = roomInput.value.trim().toLowerCase();
  if (!room) {
    try {
      room = ((await (await fetch('/api/join')).json()) as { room: string }).room;
    } catch {
      statusEl.textContent = 'Matchmaker unreachable.';
      playBtn.disabled = false;
      return;
    }
  }
  statusEl.textContent = `Connecting to ${room}…`;
  const g = new Game();
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
        (window as unknown as { sc: unknown }).sc = { game: g, renderer, input, carve };
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

/** Enemies the touch aim assist may settle on: clones in view and driven tanks (never teammates). */
function assistTargets(g: Game): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const mine = g.myTeam;
  const foe = (id: number) => id !== g.myId && (mine === Team.None || g.teamOf[id] !== mine);
  for (const v of g.remoteViews()) {
    if (v.flags & F_ALIVE && !g.tankPilots.has(v.id) && foe(v.id)) out.push({ x: v.x + ACTOR_W / 2, y: v.y + 6 });
  }
  for (const t of g.tankViews()) if (t.pilot !== 255 && foe(t.pilot)) out.push({ x: t.x + TANK_W / 2, y: t.y + TANK_H / 2 });
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
let pulse = 0;
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
      // Arrow keys steer the reticle around the clone (keyboard-only aim).
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
      const ox = sh.x;
      const oy = sh.y;
      let aim: number;
      const st = input.aimStick;
      if (st && (st.dx !== 0 || st.dy !== 0)) {
        // Touch aim stick: aim along it (assisted), and park the pointer out
        // along the aim so the crosshair, the arm and the camera follow.
        aim = assistAim(ox, oy, Math.atan2(st.dy, st.dx), assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1));
        const r = Math.min(innerWidth, innerHeight) * 0.3;
        input.mouseX = ((ox - renderer.camX) * renderer.zoom) / dpr + innerWidth / 2 + Math.cos(aim) * r;
        input.mouseY = ((oy - renderer.camY) * renderer.zoom) / dpr + innerHeight / 2 + Math.sin(aim) * r;
      } else {
        aim = Math.atan2(wy - oy, wx - ox);
        if (input.pointAssist || input.keyAim) aim = assistAim(ox, oy, aim, assistTargets(g), (x0, y0, x1, y1) => clearLine(g, x0, y0, x1, y1));
      }
      // Scoped onto someone: the aim locks onto them.
      aim = scopeLock(g, ox, oy, aim, input.scoping && g.alive && !g.drive ? (WEAPONS[g.weapon]?.lockCone ?? 0) : 0);
      g.lockAim = g.scopeLock ? aim : null;
      let buttons = input.buttons();
      // Touch: a thumb can't click a semi-automatic as fast as it cycles, so
      // a held trigger pulses (fire on alternate ticks) and the gun keeps going.
      if (input.touch && buttons & BTN_FIRE && !g.drive && !(WEAPONS[g.weapon]?.auto ?? true) && (pulse++ & 1)) buttons &= ~BTN_FIRE;
      if (input.tapFire > 0) input.tapFire--;
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
      if (click && g.building) {
        const hit = renderer.menuHit(input.mouseX, input.mouseY);
        if (hit >= 0) input.piece = hit;
        else {
          const piece = PIECES[input.piece];
          const at = snapPiece(piece, wx, wy, snapAt);
          if (g.canBuildHere(input.piece, at.x, at.y) === BuildResult.Ok) n.build(input.piece, at.x, at.y);
        }
      }
      if (g.building || g.calling) buttons &= ~BTN_FIRE;
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
