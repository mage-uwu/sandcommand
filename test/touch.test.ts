import { describe, expect, it } from 'vitest';
import { BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { stickButtons } from '../src/client/stick.ts';
import { assistAim, autoTarget, leadPoint, ballisticAim } from '../src/client/aim.ts';

describe('touch joystick', () => {
  it('maps deflection to run, jet and crouch, with a dead zone', () => {
    expect(stickButtons(0, 0)).toBe(0);
    expect(stickButtons(0.2, -0.3)).toBe(0); // resting thumb drift
    expect(stickButtons(1, 0)).toBe(BTN_RIGHT);
    expect(stickButtons(-1, 0)).toBe(BTN_LEFT);
    expect(stickButtons(0, -1)).toBe(BTN_UP);
    expect(stickButtons(0.7, -0.7)).toBe(BTN_RIGHT | BTN_UP); // jet diagonally
    expect(stickButtons(0, 1)).toBe(BTN_DOWN);
  });
});

describe('touch aim assist', () => {
  const open = () => true;
  it('settles the aim on an enemy near the line, in range and in sight', () => {
    const a = assistAim(0, 0, 0.1, [{ x: 200, y: 0 }], open);
    expect(a).toBeCloseTo(0, 5);
  });
  it('leaves the aim alone when nothing is near the line, too far, or behind a wall', () => {
    expect(assistAim(0, 0, 0, [{ x: -100, y: 173 }], open)).toBe(0); // 120 degrees off
    expect(assistAim(0, 0, 0, [{ x: 20, y: 200 }], open)).toBeCloseTo(Math.atan2(200, 20), 5); // 84 degrees off: still snaps
    expect(assistAim(0, 0, 0, [{ x: 900, y: 0 }], open)).toBe(0); // out of range
    expect(assistAim(0, 0, 0.1, [{ x: 200, y: 0 }], () => false)).toBe(0.1); // no line of sight
  });
  it('reaches further when asked (mouse aim reaches as far as the pointer)', () => {
    expect(assistAim(0, 0, 0.05, [{ x: 800, y: 0 }], open)).toBe(0.05);
    expect(assistAim(0, 0, 0.05, [{ x: 800, y: 0 }], open, 900)).toBeCloseTo(0, 5);
  });
  it('reports what it snapped onto (for the target marker), and nothing when it lets the aim be', () => {
    const mark = { x: 0, y: 0, on: false };
    assistAim(0, 0, 0.3, [{ x: 150, y: 20 }], open, undefined, mark);
    expect(mark).toEqual({ x: 150, y: 20, vx: 0, vy: 0, g: -1, on: true });
    const none = { x: 0, y: 0, on: false };
    assistAim(0, 0, Math.PI, [{ x: 150, y: 20 }], open, undefined, none);
    expect(none.on).toBe(false);
  });
  it('a clear aim at someone still picks them, however far', () => {
    // A close enemy 30 degrees off, a far one only 5 degrees off: the far one.
    const near = { x: Math.cos(0.52) * 80, y: Math.sin(0.52) * 80 };
    const far = { x: Math.cos(0.09) * 500, y: Math.sin(0.09) * 500 };
    expect(assistAim(0, 0, 0, [near, far], open)).toBeCloseTo(0.09, 5);
  });
  it('when it is ambiguous, the closer enemy wins', () => {
    // Both roughly where we aim (15 and 5 degrees off): the near one.
    const near = { x: Math.cos(0.26) * 120, y: Math.sin(0.26) * 120 };
    const far = { x: Math.cos(-0.09) * 450, y: Math.sin(-0.09) * 450 };
    expect(assistAim(0, 0, 0, [near, far], open)).toBeCloseTo(0.26, 5);
    // ...unless the near one is behind a wall.
    expect(assistAim(0, 0, 0, [near, far], (_x0, _y0, x1) => x1 > 200)).toBeCloseTo(-0.09, 5);
  });
  it('a head is its own target: aim a touch high for it, a touch low for the body', () => {
    // (One clone: on it, the point goes by angle, distance aside.)
    const head = { x: 200, y: -12, g: 7 };
    const body = { x: 200, y: -6, g: 7 };
    expect(assistAim(0, 0, Math.atan2(-14, 200), [head, body], open)).toBeCloseTo(Math.atan2(-12, 200), 5);
    expect(assistAim(0, 0, Math.atan2(-4, 200), [head, body], open)).toBeCloseTo(Math.atan2(-6, 200), 5);
  });
  it('prefers the target closest to the aim line', () => {
    const a = assistAim(0, 0, 0, [
      { x: 200, y: 30 },
      { x: 200, y: -8 },
    ], open);
    expect(a).toBeCloseTo(Math.atan2(-8, 200), 5);
  });
});

describe('sticky aim and auto mode', () => {
  const open = () => true;
  it('stays on the target it has while it is still reasonably lined up', () => {
    // Two enemies; the aim wobbles between them a little.
    const a = { x: Math.cos(0.1) * 200, y: Math.sin(0.1) * 200, g: 1 };
    const b = { x: Math.cos(-0.5) * 300, y: Math.sin(-0.5) * 300, g: 2 };
    const mark = { x: 0, y: 0, on: false, g: undefined as number | undefined };
    // Fresh, pointing right at the far one: b.
    expect(assistAim(0, 0, -0.45, [a, b], open, undefined, mark)).toBeCloseTo(-0.5, 5);
    expect(mark.g).toBe(2);
    // The thumb drifts toward a, past halfway, but not decisively: still b...
    expect(assistAim(0, 0, -0.25, [a, b], open, undefined, mark, 2)).toBeCloseTo(-0.5, 5);
    // ...where a fresh pick would have taken the nearer a.
    expect(assistAim(0, 0, -0.25, [a, b], open)).toBeCloseTo(0.1, 5);
    // Swung clearly onto a: a.
    expect(assistAim(0, 0, 0.05, [a, b], open, undefined, mark, 2)).toBeCloseTo(0.1, 5);
  });
  it('auto mode tracks the nearest enemy in sight, by centre mass, in any direction', () => {
    const head = { x: -100, y: -8, g: 3 };
    const body = { x: -100, y: 0, g: 3, core: true };
    const far = { x: 300, y: 0, g: 4, core: true };
    const t = autoTarget(0, 0, [head, body, far], open, 650)!;
    expect(t.g).toBe(3);
    expect(t.t).toBe(body);
    // Behind a wall: the next one.
    expect(autoTarget(0, 0, [head, body, far], (_a, _b, x1) => x1 > 0, 650)!.g).toBe(4);
    // Nobody in range or sight: nothing.
    expect(autoTarget(0, 0, [far], open, 200)).toBe(null);
  });
  it('auto mode keeps its target until another comes well closer', () => {
    const held = { x: 200, y: 0, g: 1, core: true };
    const other = { x: -170, y: 0, g: 2, core: true };
    expect(autoTarget(0, 0, [held, other], open, 650, 1)!.g).toBe(1); // a bit closer: keep
    const near = { x: -90, y: 0, g: 2, core: true };
    expect(autoTarget(0, 0, [held, near], open, 650, 1)!.g).toBe(2); // well closer: switch
  });
});

describe('leading moving targets', () => {
  it('aims where a moving target will be when the shot arrives', () => {
    // 400 cells off, running at 100 cells/s across; a 400 cells/s shot takes about a second.
    const p = leadPoint(0, 0, { x: 400, y: 0, vx: 0, vy: 100 }, 400, 0);
    expect(p.x).toBeCloseTo(400, 0);
    expect(p.y).toBeGreaterThan(95);
    expect(p.y).toBeLessThan(115);
    // The flight time is refined: a target running away is led further.
    const away = leadPoint(0, 0, { x: 400, y: 0, vx: 100, vy: 0 }, 400, 0);
    expect(away.x).toBeGreaterThan(520);
  });
  it('aims high for a shot that falls, and not at all for an instant one', () => {
    const lob = leadPoint(0, 0, { x: 150, y: 0, vx: 0, vy: 0 }, 340, 620);
    expect(lob.y).toBeLessThan(-20); // above it (screen y is down)
    expect(leadPoint(0, 0, { x: 300, y: 0, vx: 50, vy: 50 }, 0, 0)).toEqual({ x: 300, y: 0 });
  });
});

/** Fly a shot the way the game does (velocity, then position, each 30 Hz tick) and report its nearest pass to a moving target. */
function flyMiss(ox: number, oy: number, aim: number, speed: number, g: number, t: { x: number; y: number; vx: number; vy: number }, muzzle = 0, own = { vx: 0, vy: 0 }): number {
  const dt = 1 / 30;
  let x = ox + Math.cos(aim) * muzzle;
  let y = oy + Math.sin(aim) * muzzle;
  let vx = Math.cos(aim) * speed + own.vx;
  let vy = Math.sin(aim) * speed + own.vy;
  let tx = t.x;
  let ty = t.y;
  let best = Infinity;
  for (let i = 0; i < 300; i++) {
    vy += g * dt;
    // Nearest pass over the tick, shot and target both moving straight (as the game sweeps them).
    const rx = x - tx;
    const ry = y - ty;
    const dvx = (vx - t.vx) * dt;
    const dvy = (vy - t.vy) * dt;
    const k = Math.max(0, Math.min(1, -(rx * dvx + ry * dvy) / (dvx * dvx + dvy * dvy || 1)));
    best = Math.min(best, Math.hypot(rx + dvx * k, ry + dvy * k));
    x += vx * dt;
    y += vy * dt;
    tx += t.vx * dt;
    ty += t.vy * dt;
  }
  return best;
}

describe('ballistic aim (shots that drop)', () => {
  const GL = { speed: 340, g: 620, muzzle: 13 };
  it('lands a GL bomb on a still target, level, above and below', () => {
    for (const [x, y] of [[140, 0], [-160, 0], [100, -40], [150, 70], [-40, -60], [30, 120], [-90, 160]]) {
      const b = ballisticAim(0, 0, { x, y, vx: 0, vy: 0 }, GL.speed, GL.g, undefined, GL.muzzle)!;
      expect(b.reach).toBe(true);
      expect(flyMiss(0, 0, b.aim, GL.speed, GL.g, { x, y, vx: 0, vy: 0 }, GL.muzzle)).toBeLessThan(2);
    }
  });
  it('takes the low arc', () => {
    const b = ballisticAim(0, 0, { x: 140, y: 0, vx: 0, vy: 0 }, GL.speed, GL.g)!;
    expect(-b.aim).toBeLessThan(Math.PI / 4);
    expect(-b.aim).toBeGreaterThan(0);
  });
  it('leads a running target along the arc, from a running thrower', () => {
    const t = { x: 150, y: 0, vx: -70, vy: 0 };
    const own = { vx: 40 * 0.25, vy: 0 };
    const b = ballisticAim(0, 0, t, GL.speed, GL.g, own, GL.muzzle)!;
    expect(flyMiss(0, 0, b.aim, GL.speed, GL.g, t, GL.muzzle, own)).toBeLessThan(3);
    // The old straight-line guess misses by a mile.
    const naive = Math.atan2(t.y, t.x);
    expect(flyMiss(0, 0, naive, GL.speed, GL.g, t, GL.muzzle, own)).toBeGreaterThan(20);
  });
  it('lands a grenade and a tank shell too', () => {
    const t = { x: 150, y: 20, vx: 30, vy: 0 };
    for (const [speed, g] of [[330, 620], [520, 0.35 * 620]]) {
      const b = ballisticAim(0, 0, t, speed, g)!;
      expect(flyMiss(0, 0, b.aim, speed, g, t)).toBeLessThan(3);
    }
  });
  it('throws as far as it can toward a target out of reach', () => {
    const b = ballisticAim(0, 0, { x: 600, y: 0, vx: 0, vy: 0 }, GL.speed, GL.g)!;
    expect(b.reach).toBe(false);
    expect(b.aim).toBeCloseTo(-Math.PI / 4, 1);
    const back = ballisticAim(0, 0, { x: -600, y: 0, vx: 0, vy: 0 }, GL.speed, GL.g)!;
    expect(back.aim).toBeCloseTo((-3 * Math.PI) / 4, 1);
    // Up a cliff out of reach: steeper than 45.
    const up = ballisticAim(0, 0, { x: 100, y: -200, vx: 0, vy: 0 }, GL.speed, GL.g)!;
    expect(up.reach).toBe(false);
    expect(-up.aim).toBeGreaterThan(Math.PI / 4);
  });
});

describe('touch trigger', () => {
  it('a held finger pulses a semi-automatic, never the laser (holding is its charge), nor an automatic', async () => {
    const { touchPulses } = await import('../src/client/stick.ts');
    const { WEAPONS, WeaponId } = await import('../src/shared/weapons.ts');
    expect(touchPulses(WEAPONS[WeaponId.Sniper])).toBe(true);
    expect(touchPulses(WEAPONS[WeaponId.LightRifle])).toBe(true);
    expect(touchPulses(WEAPONS[WeaponId.Laser])).toBe(false);
    expect(touchPulses(WEAPONS[WeaponId.Rifle])).toBe(false);
    expect(touchPulses(undefined)).toBe(false);
  });
});

describe('hard lock', () => {
  const open = () => true;
  const a = { x: 200, y: 0, g: 1 };
  const b = { x: Math.cos(0.5) * 150, y: Math.sin(0.5) * 150, g: 2 };
  it('a tap or hold stays on the locked target, even pointed straight at another', async () => {
    const { ASSIST_CONE } = await import('../src/client/aim.ts');
    // Locked on a, the thumb taps right at b (30 degrees off a): still a.
    expect(assistAim(0, 0, 0.5, [a, b], open, undefined, undefined, 1, ASSIST_CONE)).toBeCloseTo(0, 5);
    // A swipe (no lock carried) picks b.
    expect(assistAim(0, 0, 0.5, [a, b], open)).toBeCloseTo(0.5, 5);
    // The locked target gone from sight: the next best, at once.
    expect(assistAim(0, 0, 0.5, [a, b], (_x0, _y0, _x1, y1) => y1 !== 0, undefined, undefined, 1, ASSIST_CONE)).toBeCloseTo(0.5, 5);
  });
  it('the mouse lets go only when swung well off the target', async () => {
    const { MOUSE_LOCK_BREAK } = await import('../src/client/aim.ts');
    // Wobbling 20 degrees toward b: stays on a.
    expect(assistAim(0, 0, 0.35, [a, b], open, undefined, undefined, 1, MOUSE_LOCK_BREAK)).toBeCloseTo(0, 5);
    // Swung right onto b, 0.6 rad off a: b.
    expect(assistAim(0, 0, 0.6, [a, b], open, undefined, undefined, 1, MOUSE_LOCK_BREAK)).toBeCloseTo(0.5, 5);
  });
});

describe('the fire pad only fires locked on', () => {
  it('a gun waits for a lock; grenades, the digger, the tools and a tank fire anywhere', async () => {
    const { wheelMayFire } = await import('../src/client/stick.ts');
    const { WeaponId } = await import('../src/shared/weapons.ts');
    for (const w of [WeaponId.Rifle, WeaponId.Sniper, WeaponId.Smg, WeaponId.Laser, WeaponId.Bazooka, WeaponId.Autocannon]) {
      expect(wheelMayFire(w, false, false)).toBe(false);
      expect(wheelMayFire(w, true, false)).toBe(true);
    }
    for (const w of [WeaponId.Grenade, WeaponId.GrenadeLauncher, WeaponId.Digger, WeaponId.RepairKit, WeaponId.Mine]) expect(wheelMayFire(w, false, false)).toBe(true);
    expect(wheelMayFire(WeaponId.Rifle, false, true)).toBe(true); // driving a tank
  });
});

