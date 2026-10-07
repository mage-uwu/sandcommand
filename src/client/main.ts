import { ACTOR_W, CHUNK_COUNT, TICK_RATE } from '../shared/constants.ts';
import { quantizeAim } from '../shared/protocol.ts';
import { Game } from './game.ts';
import { InputState } from './input.ts';
import { Net } from './net.ts';
import { Renderer } from './render.ts';

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

async function join(): Promise<void> {
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
      g.myId = w.id;
      g.room = w.room;
      game = g;
      overlay.classList.add('hidden');
      history.replaceState(null, '', `?room=${encodeURIComponent(w.room)}`);
    },
    frame(tick, ack, r) {
      try {
        g.applyFrame(tick, ack, r);
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

// Main loop: fixed 30 Hz simulation/input ticks, render every animation frame.
let acc = 0;
let last = performance.now();
function frame(now: number): void {
  renderer.resize();
  acc += Math.min(250, now - last);
  last = now;
  const g = game;
  if (g && net) {
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      const dpr = canvas.width / innerWidth;
      const wx = renderer.camX + (input.mouseX * dpr - canvas.width / 2) / renderer.zoom;
      const wy = renderer.camY + (input.mouseY * dpr - canvas.height / 2) / renderer.zoom;
      const aim = Math.atan2(wy - (g.body.y + 5), wx - (g.body.x + ACTOR_W / 2));
      const buttons = input.buttons();
      const weapon = input.weapon;
      const n = net;
      g.localTick(buttons, quantizeAim(aim), weapon, (seq) => n.input(seq, buttons, quantizeAim(aim), weapon));
    }
    renderer.draw(g, input, net, acc / TICK_MS);
  } else {
    acc = 0;
    renderer.drawIdle();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
