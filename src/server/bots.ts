import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_SCOPE, BTN_UP } from '../shared/actor.ts';
import { ClassId, DROID_MASK, stumps } from '../shared/body.ts';
import { ACTOR_H, GRAVITY } from '../shared/constants.ts';
import { PICKUP_R, PRIMARIES, invByte } from '../shared/items.ts';
import { CALL_COST, CallKind, Evac, Phase, Team, quantizeAim } from '../shared/protocol.ts';
import { MAT_HARD, Mat } from '../shared/materials.ts';
import { Rng } from '../shared/rng.ts';
import { DIGGER_REACH, LASER_MAX, PROJ, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { CANNON_SPEED, SMG_SPEED, TANK_H, TANK_W, isPet, isSpider, tankH, tankW } from '../shared/tank.ts';
import { ENGINE_NOZZLE_Y, ENGINE_X, SHIP_H, SHIP_W, ShipPart, hasShipPart, shipPoint } from '../shared/dropship.ts';
import type { InputCmd, Player, World } from './world.ts';
import { COLS, SHAFT_HALF } from '../shared/dungeon.ts';
import { cellCentreX, cellOfFeet, inShaftUnder, mazeDistances, nextHop } from './maze.ts';
import { type Ramp, caveLevel, onPassage } from '../shared/caves.ts';

/** Names for bots (shown with a BOT tag). */
const NAMES = [
  'Vasquez', 'Hicks', 'Drake', 'Apone', 'Ferro', 'Dietrich', 'Frost', 'Wierzbowski', 'Crowe', 'Spunkmeyer',
  'Gorman', 'Hudson', 'Ripley', 'Bishop', 'Dutch', 'Blain', 'Mac', 'Billy', 'Poncho', 'Hawkins',
  'Rico', 'Dizzy', 'Ace', 'Zim', 'Sugar', 'Flores', 'Kitten', 'Shujumi', 'Brutus', 'Carmen',
];

export function botName(rng: Rng): string {
  return `BOT ${NAMES[rng.int(NAMES.length)]}`;
}

/** Fighting distance by weapon: close enough to hit, far enough to live. */
const RANGE: Record<number, number> = {
  [WeaponId.Rifle]: 130,
  [WeaponId.Bazooka]: 170,
  [WeaponId.Grenade]: 110,
  [WeaponId.Sniper]: 280,
  [WeaponId.Digger]: 0,
  [WeaponId.Shotgun]: 55,
  [WeaponId.GrenadeLauncher]: 150,
  [WeaponId.Gatling]: 140,
  [WeaponId.Laser]: 230,
  [WeaponId.ATCannon]: 240,
  [WeaponId.LightRifle]: 200,
  [WeaponId.Smg]: 85,
  [WeaponId.Autocannon]: 160,
  [WeaponId.Blaster]: 150,
};
const MAX_SHOT = 340; // won't shoot at anything further than this
/** Anti-air: how far off a bot will shoot at an enemy dropship, and with what (not grenades, tools or the radio). */
const AA_RANGE = 360;
const ANTI_AIR: number[] = [WeaponId.Rifle, WeaponId.Bazooka, WeaponId.Sniper, WeaponId.Shotgun, WeaponId.GrenadeLauncher, WeaponId.Gatling, WeaponId.Laser, WeaponId.ATCannon, WeaponId.LightRifle, WeaponId.Smg, WeaponId.Autocannon, WeaponId.Blaster];
/** How far around itself a prospecting bot looks for gold (half-width, and depth from just above its head). */
const GOLD_SCAN_W = 220;
const GOLD_SCAN_H = 280;
/** Gold cells (of 25 sampled around it) that make a seam worth digging for. */
const GOLD_SEAM = 8;
/** The chance, each life, that a bot takes on the prospecting objective. */
const PROSPECT_CHANCE = 0.15;
/** Hard cells (sampled every other row) over a seam that make it not worth the dig. */
const GOLD_HARD = 3;
/** Ticks of digging with nothing to show for it before a seam is given up. */
const GOLD_STALL = 120;
/** With this many enemies left or fewer, prospectors stop digging and fight. */
const ENDGAME_FOES = 4;

/**
 * A server-side bot: it reads the world directly (no network) and emits the
 * same input command a client would, so it plays by exactly the same rules:
 * same rate of fire, magazines, inventory, rockets. Thinking is cheap and
 * staggered: target choice every half second, line of sight every few
 * ticks, steering and aim every tick.
 */
export class BotBrain {
  private readonly rng: Rng;
  /** Aim error (radians) and how often it hesitates: per-bot skill. */
  private readonly noise: number;
  private target = -1;
  private seeTarget = false;
  private strafe = 1;
  private strafeUntil = 0;
  private stuck = 0;
  /** Ticks a nearby target has been out of sight (a floor or wall between us). */
  private blind = 0;
  private lastX = 0;
  private trigger = false;
  private seq = 0;
  private nadeUntil = 0;
  /** Laying a landmine until this tick. */
  private mineUntil = 0;
  /** Not before this tick: a beat to get bearings after landing, and to react to a new target. */
  private holdFire = 0;
  private wasAlive = false;
  private readonly react: number;
  private readonly phase: number;
  /** Some bots go for a tank when one lands near them. */
  private readonly tanker: boolean;
  /** Regicide: some bots go straight for the enemy king; the rest fight whoever is nearest. */
  private readonly assault: boolean;
  /** Ticks driving without getting anywhere (it shells the way clear, then bails out). */
  private tankStuck = 0;
  /** Distance to the target at the last progress check (driving). */
  private progD = Infinity;
  /** A tank it gave up on, left alone until `abandonUntil`. */
  private abandoned = -1;
  private abandonUntil = 0;
  /** Extraction: distances through the labyrinth to the current goal, what goal they're for, and when they were worked out. */
  private navDist: Int16Array | null = null;
  private navKey = '';
  private navAt = -1e9;
  /** How long to charge the laser before letting go (ticks). */
  private laserGoal = 30;
  /** Extraction: resting on a ledge to refill the jetpack before the next climb. */
  private resting = false;
  /**
   * A rare objective, rolled each life: go prospecting. Dig down to real
   * gold whenever the fighting's elsewhere, to buy a dropship.
   */
  private prospector = false;
  /** The gold cell it's digging toward, and when it last looked for one. */
  private gold: { x: number; y: number } | null = null;
  private goldScanAt = -1e9;
  /** Mining progress: gold banked when it last went up, and when. Seams it gave up on (rock in the way). */
  private goldBanked = 0;
  private goldGainAt = 0;
  private readonly badGold: { x: number; y: number }[] = [];
  /** Anti-air: the enemy dropship point it's shooting at (re-picked a few times a second), and its velocity. */
  private air: { x: number; y: number; vx: number; vy: number } | null = null;
  private readonly airPt = { x: 0, y: 0 };

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.noise = 0.06 + this.rng.next() * 0.12;
    this.phase = this.rng.int(15);
    this.react = 15 + this.rng.int(25);
    this.tanker = this.rng.next() < 0.5;
    this.assault = this.rng.next() < 0.5;
  }

  /**
   * Real gold to dig for: the nearest seam (a cell of gold with more around
   * it, not a stray grain) under or beside us, as deep as a long shaft
   * reaches. Walking there counts for less than digging down to it, and
   * gold above (which would mean tunnelling up) for more. Re-scanned every
   * few seconds, or as soon as the cell it was after is dug out.
   */
  private findGold(world: World, p: Player): { x: number; y: number } | null {
    const t = world.tick;
    const g = this.gold;
    if (g && world.terrain.get(g.x, g.y) === Mat.Gold && t - this.goldScanAt < 150) return g;
    if (g === null && t - this.goldScanAt < 45) return null;
    this.goldScanAt = t;
    this.gold = null;
    const ter = world.terrain;
    let best = Infinity;
    const x0 = Math.floor(p.cx) - GOLD_SCAN_W;
    const y0 = Math.floor(p.cy) - 30;
    for (let y = y0; y < y0 + GOLD_SCAN_H; y += 3) {
      for (let x = x0; x < x0 + GOLD_SCAN_W * 2; x += 3) {
        if (ter.get(x, y) !== Mat.Gold || this.badGold.some((b) => Math.abs(b.x - x) < 14 && Math.abs(b.y - y) < 14)) continue;
        const d = Math.abs(x - p.cx) + Math.max(0, y - p.cy) * 1.3 + Math.max(0, p.cy - y) * 3;
        if (d >= best) continue;
        // A seam, not a speck: enough gold around it to be worth the dig.
        let n = 0;
        for (let yy = y - 4; yy <= y + 4; yy += 2) for (let xx = x - 4; xx <= x + 4; xx += 2) if (ter.get(xx, yy) === Mat.Gold) n++;
        if (n < GOLD_SEAM) continue;
        // Dug for from above: skip it under a bunker (concrete, steel) or
        // stone that never yields; rock in the way only makes it a longer dig.
        let built = 0;
        let rock = 0;
        for (let yy = y - 2; yy > ter.surfaceY(x) - 1 && built <= GOLD_HARD; yy -= 2) {
          const m = ter.get(x, yy);
          if (m === Mat.Rock) rock++;
          else if (MAT_HARD[m]) built++;
        }
        if (built > GOLD_HARD || d + rock * 6 >= best) continue;
        best = d + rock * 6;
        this.gold = { x, y };
      }
    }
    return this.gold;
  }

  /**
   * Anti-air: the best point to shoot on an enemy dropship in sight and
   * reach, if it's nearer than the clone it's fighting (`fight`): an engine
   * pod still on its pylon first (they hang out, and losing two brings it
   * down), else the hull.
   */
  private airTarget(world: World, p: Player, sx: number, sy: number, fight: number): { x: number; y: number; vx: number; vy: number } | null {
    let best: { x: number; y: number; vx: number; vy: number } | null = null;
    let bestD = Math.min(AA_RANGE, fight * 1.2);
    for (const sh of world.ships) {
      if (!sh || sh.leaving || sh.owner === p.id || (p.team !== Team.None && sh.team === p.team)) continue;
      const cx = sh.x + SHIP_W / 2;
      const cy = sh.y + SHIP_H / 2;
      if (Math.hypot(cx - sx, cy - sy) > bestD + SHIP_W) continue;
      for (let e = 0; e <= 4; e++) {
        // Pods first: a pod counts as a little nearer than the hull.
        const pod = e < 4;
        if (pod && !hasShipPart(sh.parts, ShipPart.EngineA + e)) continue;
        const q = pod ? shipPoint(sh, ENGINE_X[e], ENGINE_NOZZLE_Y - 4, this.airPt) : { x: cx, y: cy };
        const d = Math.hypot(q.x - sx, q.y - sy) * (pod ? 0.85 : 1);
        if (d >= bestD || !clearLine(world, sx, sy, q.x, q.y)) continue;
        bestD = d;
        best = { x: q.x, y: q.y, vx: sh.vx, vy: sh.vy };
      }
    }
    // An enemy watchdog or tarantula (nobody inside to shoot at: the machine itself is the target; a tarantula's chassis).
    for (const k of world.tanks) {
      if (!k || !isPet(k) || k.chute || k.owner === p.id || (p.team !== Team.None && world.players[k.owner]?.team === p.team)) continue;
      const cx = k.x + tankW(k) / 2;
      const cy = k.y + tankH(k) * (isSpider(k) ? 0.7 : 0.5);
      const d = Math.hypot(cx - sx, cy - sy);
      if (d >= bestD || !clearLine(world, sx, sy, cx, cy)) continue;
      bestD = d;
      best = { x: cx, y: cy, vx: k.vx, vy: k.vy };
    }
    return best;
  }

  think(world: World, p: Player): InputCmd {
    const t = world.tick;
    this.seq = (this.seq + 1) & 0xffff;
    const cmd: InputCmd = { seq: this.seq, buttons: 0, aim: p.aimQ, inv: invByte(p.slot, p.invVersion) };
    // Dead, or riding in: hands off (the rocket's autopilot lands it).
    if (!p.alive) {
      this.wasAlive = false;
      return cmd;
    }
    const rng = this.rng;
    if (!this.wasAlive) {
      this.wasAlive = true;
      this.holdFire = t + 45 + rng.int(45); // just landed: look around first
      this.prospector = rng.next() < PROSPECT_CHANCE;
      this.gold = null;
      this.badGold.length = 0;
    }

    // Pick a target: the nearest living clone, re-chosen twice a second.
    let tgt = this.target >= 0 ? world.players[this.target] : null;
    const prevTarget = this.target;
    if (!tgt || !tgt.alive || (t + this.phase) % 15 === 0) {
      this.target = -1;
      let best = Infinity;
      for (const o of world.players) {
        if (!o || o === p || !o.alive || (p.team !== Team.None && o.team === p.team)) continue;
        const d = (o.cx - p.cx) ** 2 + (o.cy - p.cy) ** 2;
        if (d < best) {
          best = d;
          this.target = o.id;
        }
      }
      // Regicide assault: the enemy king, wherever he hides (unless someone is right here).
      const king = world.regicideLive && this.assault && p.team !== Team.None ? world.players[world.kings[1 - p.team]] : null;
      if (king && king.alive && best > 90 * 90) this.target = king.id;
      tgt = this.target >= 0 ? world.players[this.target] : null;
      if (tgt && tgt.id !== prevTarget) this.holdFire = Math.max(this.holdFire, t + this.react);
    }

    if (p.tank >= 0) return this.driveTank(world, p, tgt, cmd);

    const sx = p.body.x + SHOULDER_X;
    const sy = p.body.y + SHOULDER_Y;
    // Unarmed (lost its gun)? Go and get one.
    const gunSlot = p.inv.findIndex((it) => PRIMARIES.includes(it.weapon));
    let pickup = false;
    let goalX = tgt ? tgt.cx : p.cx + this.strafe * 60;
    if (gunSlot < 0) {
      let best = 260 * 260;
      for (const it of world.items) {
        if (!PRIMARIES.includes(it.weapon)) continue;
        const d = (it.x - p.cx) ** 2 + (it.y - p.cy) ** 2;
        if (d < best) {
          best = d;
          goalX = it.x;
          pickup = d < PICKUP_R * PICKUP_R;
        }
      }
    }

    // An empty tank landed close by, and nobody to fight right here: take it.
    const near = tgt ? Math.hypot(tgt.cx - p.cx, tgt.cy - p.cy) : Infinity;
    if (this.tanker && near > 120 && !world.extractionLive) {
      for (let slot = 0; slot < world.tanks.length; slot++) {
        const k = world.tanks[slot];
        if (!k || k.pilot !== 255 || k.chute || isPet(k) || (slot === this.abandoned && t < this.abandonUntil)) continue;
        const kx = k.x + TANK_W / 2;
        if (Math.abs(kx - p.cx) > 260 || Math.abs(k.y + TANK_H / 2 - p.cy) > 80) continue;
        goalX = kx;
        const dx = Math.max(k.x - (p.body.x + 8), 0, p.body.x - (k.x + TANK_W));
        const dy = Math.max(k.y - (p.body.y + 14), 0, p.body.y - (k.y + TANK_H));
        pickup = dx <= 8 && dy <= 8 && (t & 7) === 0;
        break;
      }
    }

    // Extraction: the objective comes first (the idol, the surface, the rocket).
    const nav = world.extractionLive ? this.extractionNav(world, p) : null;
    if (nav) {
      goalX = nav.goalX;
      if (nav.pickup) pickup = (t & 1) === 0;
    }

    // Saving up for a dropship: with the fighting elsewhere, go and dig gold;
    // with enough banked, get on the radio (for itself, or its whole team).
    const near2 = tgt ? Math.hypot(tgt.cx - p.cx, tgt.cy - p.cy) : Infinity;
    // (Nearly there: it keeps its head down and digs unless they're right on it.)
    const quiet = !tgt || near2 > (p.gold >= CALL_COST / 2 ? 130 : 220) || (!this.seeTarget && near2 > 110);
    const radioSlot = p.inv.findIndex((it) => it.weapon === WeaponId.Radio);
    const airCover = world.ships.some((sh) => sh && !sh.leaving && (sh.owner === p.id || (p.team !== Team.None && sh.team === p.team)));
    const calling =
      !nav && !world.extractionLive && !(world.regicideLive && world.isKing(p)) && radioSlot >= 0 && p.gold >= CALL_COST && p.callCd === 0 && !airCover && world.ships.includes(null) && (!tgt || near2 > 110);
    if (calling && p.weapon === WeaponId.Radio) world.call(p.id, CallKind.Dropship);
    // (Not in the endgame: with only a few enemies left, it's time to finish them.)
    let foesLeft = 0;
    if (this.prospector) for (const o of world.players) if (o && o.alive && o !== p && (p.team === Team.None || o.team !== p.team)) foesLeft++;
    const goldAt = !calling && this.prospector && quiet && (foesLeft > ENDGAME_FOES || world.phase !== Phase.Live) && !nav && !world.extractionLive && !(world.regicideLive && world.isKing(p)) && p.gold < CALL_COST && gunSlot >= 0 ? this.findGold(world, p) : null;
    if (goldAt) goalX = goldAt.x;
    // A cave map, and the target somewhere else in the caves (or up top): the way there.
    const cave = !nav && !goldAt && !calling && tgt && !this.seeTarget ? this.caveNav(world, p, tgt) : null;
    if (cave) goalX = cave.goalX;

    // Moving and getting nowhere: stuck against a wall.
    const moved = Math.abs(p.body.x - this.lastX);
    this.lastX = p.body.x;
    this.stuck = moved < 0.3 ? this.stuck + 1 : Math.max(0, this.stuck - 2);

    // Which weapon: the gun, a grenade now and then up close, the digger when walled in.
    let want = gunSlot;
    const dist = tgt ? Math.hypot(tgt.cx - p.cx, tgt.cy - p.cy) : Infinity;
    const nadeSlot = p.inv.findIndex((it) => it.weapon === WeaponId.Grenade && it.ammo > 0);
    const digSlot = p.inv.findIndex((it) => it.weapon === WeaponId.Digger);
    if (nadeSlot >= 0 && dist < 150 && t > this.nadeUntil + 90 && rng.next() < 0.01) this.nadeUntil = t + 30;
    if (t < this.nadeUntil && nadeSlot >= 0) want = nadeSlot;
    // Nobody about and on its feet: now and then, leave a landmine behind.
    const mineSlot = p.inv.findIndex((it) => it.weapon === WeaponId.Mine && it.ammo > 0);
    if (mineSlot >= 0 && p.body.onGround && (!tgt || (!this.seeTarget && dist > 200)) && t > this.mineUntil + 300 && rng.next() < 0.004) this.mineUntil = t + 12;
    if (t < this.mineUntil && mineSlot >= 0) want = mineSlot;
    // Up close with a launcher: a gun that won't blow us up too, if we carry one.
    const splashy = p.inv[want]?.weapon === WeaponId.Bazooka || p.inv[want]?.weapon === WeaponId.GrenadeLauncher;
    if (dist < 70 && splashy) {
      const safe: number[] = [WeaponId.Shotgun, WeaponId.Smg, WeaponId.Gatling, WeaponId.Rifle, WeaponId.LightRifle, WeaponId.Blaster, WeaponId.Laser, WeaponId.Sniper];
      const gun = p.inv.findIndex((it) => safe.includes(it.weapon));
      if (gun >= 0) want = gun;
    }
    // Out of sight but close, or straight above/below (a roof or floor away,
    // however high): counts toward digging to it.
    this.blind = tgt && !this.seeTarget && (dist < 160 || Math.abs(tgt.cx - p.cx) < 60) ? this.blind + 1 : 0;
    // Walled in, or a target close by on the other side of a floor or wall: dig to it.
    // Headroom: open sky (or room) above means a wall can be jumped or jetted over.
    const bx0 = Math.floor(p.body.x);
    const by0 = Math.floor(p.body.y);
    const headClear = !world.terrain.rectSolid(bx0, by0 - 22, bx0 + 7, by0 - 1);
    // (The labyrinth's stone never yields: no digging through it.)
    // Close enough to the gold to bite at it (or tunnelling down to it).
    // Mining: once over the seam, sink a shaft straight down to it (or
    // just bite at it when it's within the beam's reach).
    const gdx = goldAt ? goldAt.x - p.cx : 0;
    const gdy = goldAt ? goldAt.y - sy : 0;
    const mining = !!goldAt && digSlot >= 0 && (Math.hypot(goldAt.x - sx, gdy) < DIGGER_REACH + 6 || (Math.abs(gdx) < 6 && gdy > 0));
    if (mining) this.stuck = 0; // (standing still on purpose: not stuck)
    // Digging and getting nothing (rock or steel in the way): give that seam up and find another.
    if (p.gold !== this.goldBanked || !mining) {
      this.goldBanked = p.gold;
      this.goldGainAt = t;
    } else if (goldAt && t - this.goldGainAt > GOLD_STALL) {
      this.badGold.push(goldAt);
      if (this.badGold.length > 8) this.badGold.shift();
      this.gold = null;
      this.goldScanAt = -1e9;
      this.goldGainAt = t;
    }
    const digging = !world.extractionLive && digSlot >= 0 && (mining || (!this.seeTarget && (this.stuck > 75 || this.blind > 60)));
    if (digging) want = digSlot;
    if (calling) want = radioSlot;
    if (want < 0) want = digSlot >= 0 ? digSlot : p.slot;
    // Hurt or maimed, with nobody shooting back right now: patch up with the nanobots.
    const kitSlot = p.inv.findIndex((it) => it.weapon === WeaponId.RepairKit);
    const healing = kitSlot >= 0 && !digging && (p.hp < 55 || stumps(p.parts.mask, p.parts.cls) > 0 || (p.parts.cls === ClassId.Droid && p.parts.mask !== DROID_MASK)) && (!tgt || !this.seeTarget || dist > 200);
    if (healing && !calling) want = kitSlot;
    const weapon = p.inv[want]?.weapon ?? WeaponId.Digger;

    // Line of sight to the target, every few ticks.
    if (tgt && (t + this.phase) % 4 === 0) this.seeTarget = clearLine(world, sx, sy, tgt.cx, tgt.cy);

    // Movement: close to fighting range, back off if too close, strafe in between.
    let buttons = 0;
    const range = RANGE[weapon] ?? 120;
    const dx = goalX - p.cx;
    let dir = 0;
    // On the objective unless someone's right in our face (a carrier never stops to brawl).
    const onTask = nav && !(tgt && this.seeTarget && dist < 100 && !nav.urgent);
    if (onTask) dir = Math.abs(dx) < 2.5 || nav.fall ? 0 : Math.sign(dx);
    else if (cave) dir = Math.abs(dx) < 2.5 ? 0 : Math.sign(dx);
    else if (goldAt) dir = Math.abs(gdx) < 3 || (mining && Math.abs(gdx) < 6) ? 0 : Math.sign(gdx);
    else if (calling) dir = 0;
    else if (gunSlot < 0 || !tgt) dir = Math.sign(dx);
    else if (weapon === WeaponId.Digger) dir = Math.sign(dx);
    else if (dist > range + 30 || !this.seeTarget) dir = Math.sign(dx);
    else if (dist < range - 50) dir = -Math.sign(dx);
    else {
      if (t > this.strafeUntil) {
        this.strafe = rng.next() < 0.5 ? -1 : 1;
        this.strafeUntil = t + 20 + rng.int(40);
      }
      dir = this.strafe;
    }
    if (dir > 0) buttons |= BTN_RIGHT;
    if (dir < 0) buttons |= BTN_LEFT;
    // Jump or jet: over walls, up to a target above, and to break a long fall.
    const b = p.body;
    if (dir !== 0 && this.stuck > 6 && headClear) buttons |= BTN_UP;
    if (onTask) {
      if (nav.up) buttons |= BTN_UP;
    } else if (cave) {
      if (cave.up) buttons |= BTN_UP;
    } else if (tgt && tgt.cy < p.cy - 50 && b.fuel > 35) buttons |= BTN_UP;
    if (b.vy > 260 && b.fuel > 5) buttons |= BTN_UP;

    // Aim: lead the target by the shot's flight time, lift lobbed shots, add skill noise.
    let ax = goalX;
    let ay = p.cy;
    const def = WEAPONS[weapon];
    if (tgt && def) {
      const speed = def.speed || 400;
      const lead = dist / speed;
      ax = tgt.cx + tgt.body.vx * lead;
      ay = tgt.cy + tgt.body.vy * lead * 0.5;
      if (def.proj >= 0) ay -= 0.5 * GRAVITY * PROJ[def.proj].gravity * lead * lead;
    }
    let sweep = 0;
    if (weapon === WeaponId.Digger && mining && goldAt) {
      const tl = Math.hypot(goldAt.x - sx, gdy) || 1;
      if (tl > DIGGER_REACH + 6) {
        // Over it, out of reach: sink a shaft straight down, the beam swept
        // a little either way so the shaft's wide enough to drop down.
        ax = p.cx + Math.sin(t * 0.5) * 6;
        ay = sy + DIGGER_REACH;
      } else {
        // In reach: straight at the gold; the beam bites the first solid cell on the way.
        ax = sx + ((goldAt.x - sx) / tl) * DIGGER_REACH;
        ay = sy + (gdy / tl) * DIGGER_REACH;
      }
    } else if (weapon === WeaponId.Digger) {
      // Dig at the target when it's just the other side of a floor or wall;
      // otherwise through the obstacle in the way.
      let tx = (tgt ? tgt.cx : goalX) - p.cx;
      let ty = (tgt ? tgt.cy : p.cy) - p.cy;
      if (this.blind <= 60) {
        // Blocked on the way somewhere: straight through whatever is ahead.
        tx = Math.sign(tx) || 1;
        ty = 0;
      }
      const tl = Math.hypot(tx, ty) || 1;
      ax = sx + (tx / tl) * 20;
      ay = sy + 3 + (ty / tl) * 20; // from mid-body
      // Boxed in for a while (leftover pixels of concrete or rock pinning
      // it): clear the nearest solid cell around the body, leaning toward
      // where it's going, never the floor under its feet.
      if (this.stuck > 150) {
        const near = nearestBlock(world, p, Math.sign(dx) || 1);
        if (near) {
          ax = near.x;
          ay = near.y;
          sweep = 0;
        }
      }
      // Sweep the beam up and down so the hole is tall enough to walk through
      // (in concrete only the beam's core bites).
      if (this.stuck <= 150) sweep = Math.sin(t * 0.35) * 0.65;
    }
    // Anti-air: an enemy dropship overhead, nearer than whoever it's fighting: shoot it down.
    const antiAir = !digging && !healing && !calling && !!def && ANTI_AIR.includes(weapon);
    if (!antiAir) this.air = null;
    else if ((t + this.phase) % 6 === 0) this.air = this.airTarget(world, p, sx, sy, tgt && this.seeTarget ? dist : Infinity);
    const air = this.air;
    if (air && def) {
      const lead = Math.hypot(air.x - sx, air.y - sy) / (def.speed || 400);
      ax = air.x + air.vx * lead;
      ay = air.y + air.vy * lead;
      if (def.proj >= 0) ay -= 0.5 * GRAVITY * PROJ[def.proj].gravity * lead * lead;
      sweep = 0;
    }
    const aim = Math.atan2(ay - sy, ax - sx) + sweep + (rng.next() - 0.5) * 2 * this.noise;
    cmd.aim = quantizeAim(aim);

    // Fire: with a clear line (or digging), in range; semi-auto weapons get a fresh press each shot.
    // No point-blank blasts, unless cornered with nothing else.
    const minRange = this.stuck > 30 ? 0 : weapon === WeaponId.Bazooka ? 70 : weapon === WeaponId.Grenade || weapon === WeaponId.GrenadeLauncher ? 50 : 0;
    const shoot = air
      ? t >= this.holdFire
      : weapon === WeaponId.Mine
        ? t < this.mineUntil && t > this.mineUntil - 8
        : weapon === WeaponId.RepairKit
        ? healing
        : weapon === WeaponId.Digger
        ? digging
        : tgt !== null && t >= this.holdFire && this.seeTarget && dist < MAX_SHOT && dist > minRange && (weapon !== WeaponId.Grenade || dist < 220);
    if (weapon === WeaponId.Laser) {
      // Laser: hold to charge (longer the further off they are), then let go to fire.
      if (shoot && p.charge < this.laserGoal) buttons |= BTN_FIRE;
      else if (p.charge === 0) this.laserGoal = Math.min(LASER_MAX, 12 + Math.floor(dist / 3) + rng.int(40));
    } else if (shoot) {
      this.trigger = def?.auto ? true : !this.trigger;
      if (this.trigger) buttons |= BTN_FIRE;
    } else this.trigger = false;

    // A king holds his vault: he turns and fights, but never leaves it.
    if (world.regicideLive && world.isKing(p)) {
      buttons &= ~(BTN_LEFT | BTN_RIGHT | BTN_UP);
      if (weapon === WeaponId.Digger) buttons &= ~BTN_FIRE;
      if (want === digSlot && gunSlot >= 0) want = gunSlot;
      pickup = false;
    }
    cmd.buttons = buttons;
    cmd.inv = invByte(want >= 0 ? want : p.slot, p.invVersion, pickup);
    return cmd;
  }

  /**
   * Driving: keep the target at cannon range, jet over whatever blocks the
   * treads, hose it with the vulcan and lob shells at it. A tank that gets
   * nowhere for long enough is abandoned (out of the hatch, on foot again).
   */
  /**
   * Extraction: where to go next. Carrying the idol, out by the nearest well
   * and on to the extraction rocket; a teammate carrying it, stay with them;
   * otherwise after the idol (on its altar, dropped, or in an enemy's hands).
   * Through the labyrinth it follows a breadth-first route cell by cell:
   * sideways through doorways, down by dropping through a floor shaft, up by
   * jetting through one (resting on a ledge when the jetpack runs low).
   */
  private extractionNav(world: World, p: Player): { goalX: number; up: boolean; fall: boolean; pickup: boolean; carrying: boolean; urgent: boolean } | null {
    const d = world.dungeon;
    if (!d) return null;
    const b = p.body;
    const holder = world.idolHolder();
    const carrying = holder === p;
    let tx = p.cx;
    let ty = p.cy;
    let pickup = false;
    let urgent = carrying;
    if (holder && !carrying) {
      tx = holder.cx;
      ty = holder.body.y;
    } else if (!holder) {
      const it = world.items.find((o) => o.weapon === WeaponId.Idol);
      if (it) {
        tx = it.x;
        ty = it.y - ACTOR_H + 1;
        const d2 = Math.hypot(it.x - p.cx, it.y - p.cy);
        pickup = d2 < PICKUP_R - 2;
        urgent = d2 < 80; // it's right there: grab it, fight later
      }
    }
    const wantSurface = carrying || cellOfFeet(tx, ty) < 0;
    const wells = d.entrances.slice(0, 4);
    const here = cellOfFeet(p.cx, b.y);
    const out = { goalX: tx, up: false, fall: false, pickup, carrying, urgent };

    if (here < 0) {
      // Up top: the desert, or inside a well.
      let well = wells[0];
      for (const w of wells) if (Math.abs(w.x - p.cx) < Math.abs(well.x - p.cx)) well = w;
      const inWell = Math.abs(p.cx - well.x) < SHAFT_HALF + 2 && b.y + ACTOR_H > well.top - 1;
      if (wantSurface) {
        if (inWell) {
          // Climb out of the well, then step off its mouth.
          out.goalX = b.y + ACTOR_H > well.top - 3 ? well.x : well.x + (p.cx < well.x ? -40 : 40);
          out.up = b.y + ACTOR_H > well.top - 6;
          return out;
        }
        if (carrying) {
          const e = world.evac;
          out.goalX = e.state === Evac.Landed ? e.x : p.cx;
        } else out.up = ty < b.y - 20 && b.fuel > 20; // up to wherever it is
        return out;
      }
      // Down the nearest well (the pyramid's shaft is a long climb back).
      out.goalX = well.x;
      out.fall = Math.abs(p.cx - well.x) < 3;
      return out;
    }

    // In the labyrinth: route to the goal cell(s).
    const goals = wantSurface ? wells.map((w) => w.c) : [cellOfFeet(tx, ty)];
    const key = goals.join(',');
    if (key !== this.navKey || world.tick - this.navAt > 45) {
      this.navDist = mazeDistances(d, goals);
      this.navKey = key;
      this.navAt = world.tick;
    }
    const dist = this.navDist!;
    const r = Math.floor(here / COLS);
    const centre = cellCentreX(here);
    const climb = () => {
      // Rest on the floor beside the shaft when low, then go up its middle.
      if (this.resting && b.fuel > 90) this.resting = false;
      if (!this.resting && b.fuel < 18) this.resting = true;
      if (this.resting) {
        out.goalX = centre + (p.cx < centre ? -SHAFT_HALF - 7 : SHAFT_HALF + 7);
        return out;
      }
      out.goalX = centre;
      out.up = Math.abs(p.cx - centre) < SHAFT_HALF - 4 || inShaftUnder(b.y, r);
      return out;
    };
    if (wantSurface && dist[here] === 0) return climb(); // up the well
    if (dist[here] === 0) {
      out.goalX = tx;
      out.up = ty < b.y - 24 && b.fuel > 20; // up on a ledge in the same hall
      return out;
    }
    const nxt = nextHop(d, dist, here);
    if (nxt < 0) return out;
    if (nxt === here + COLS) {
      out.goalX = centre;
      out.fall = Math.abs(p.cx - centre) < 3;
      return out;
    }
    if (nxt === here - COLS) return climb();
    this.resting = false;
    if (inShaftUnder(b.y, r)) {
      // Still coming up through the floor: clear it first.
      out.goalX = centre;
      out.up = true;
      return out;
    }
    out.goalX = cellCentreX(nxt);
    return out;
  }

  /**
   * A cave map (caves.ts), its target on another level (the surface, the
   * highway, the deep run) and out of sight: which way to go. Up a level by
   * the nearest way up from here (a ramp or link passage, walked; a shaft,
   * jetted up its middle, resting on the floor beside it when the jetpack
   * runs low); down by the nearest passage, or by dropping down a shaft it's
   * standing over. Halfway along a passage or up a shaft, it carries on.
   */
  private caveNav(world: World, p: Player, tgt: Player): { goalX: number; up: boolean } | null {
    const net = world.caves;
    if (!net) return null;
    const b = p.body;
    const feet = b.y + ACTOR_H;
    const me = caveLevel(net, p.cx, feet);
    const it = caveLevel(net, tgt.cx, tgt.body.y + ACTOR_H);
    const up = it < me || (it === me && tgt.cy < p.cy - 80);
    // Partway along a passage: on to its far end.
    for (const r of [...net.ramps, ...net.links]) {
      if (!onPassage(r, p.cx, feet)) continue;
      const end = up ? r.top : r.bottom;
      const dir = Math.sign(end.x - (up ? r.bottom.x : r.top.x));
      if (Math.abs(p.cx - end.x) > 6) return { goalX: end.x + dir * 30, up: false };
    }
    // In a shaft: up its middle (resting when low), or down it.
    for (const s of net.shafts) {
      if (Math.abs(p.cx - s.x) > 14 || feet <= s.top + 2 || feet >= s.bottom - 2) continue;
      if (this.resting && b.fuel > 90) this.resting = false;
      if (!this.resting && b.fuel < 12) this.resting = true;
      return { goalX: s.x, up: up && !this.resting };
    }
    if (me === it) return null;
    // The ways off this level, up or down, nearest first (weighed toward the target).
    let best: { goalX: number; up: boolean } | null = null;
    let bestD = Infinity;
    const consider = (x: number, go: { goalX: number; up: boolean }) => {
      const d = Math.abs(x - p.cx) + Math.abs(x - tgt.cx) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = go;
      }
    };
    const passages: Ramp[] = me === 2 || (me === 1 && !up) ? net.links : net.ramps;
    for (const r of passages) {
      const from = up ? r.bottom : r.top;
      if (caveLevel(net, from.x, from.y) !== me && !(me === 0 && !up)) continue;
      consider(from.x, { goalX: from.x, up: false });
    }
    for (const s of net.shafts) {
      // Up: from the tunnel at its foot. Down: only standing in the room it opens out of.
      if (up && caveLevel(net, s.x, s.bottom) === me) {
        const under = Math.abs(p.cx - s.x) < 10;
        if (this.resting && b.fuel > 90) this.resting = false;
        if (!this.resting && b.fuel < 12) this.resting = true;
        consider(s.x, { goalX: this.resting ? s.x + 24 : s.x, up: under && !this.resting });
      } else if (!up && Math.abs(feet - s.top) < 8 && Math.abs(p.cx - s.x) < 80) consider(s.x, { goalX: s.x, up: false });
    }
    return best;
  }

  private driveTank(world: World, p: Player, tgt: Player | null, cmd: InputCmd): InputCmd {
    const t = world.tick;
    const k = world.tanks[p.tank];
    if (!k) return cmd;
    const cx = k.x + TANK_W / 2;
    const cy = k.y + 6;
    const moved = Math.abs(k.x - this.lastX);
    this.lastX = k.x;
    let buttons = 0;
    if (tgt) {
      const dx = tgt.cx - cx;
      const dist = Math.hypot(dx, tgt.cy - cy);
      if ((t + this.phase) % 4 === 0) this.seeTarget = clearLine(world, cx, cy - 4, tgt.cx, tgt.cy);
      const dir = !this.seeTarget || Math.abs(dx) > 220 ? Math.sign(dx) : Math.abs(dx) < 90 ? -Math.sign(dx) : 0;
      if (dir > 0) buttons |= BTN_RIGHT;
      if (dir < 0) buttons |= BTN_LEFT;
      // Stuck means no progress toward the target over a couple of seconds
      // (rocking against a face it can't climb still counts as stuck).
      if (dir === 0) this.tankStuck = 0;
      else if (moved < 0.3) this.tankStuck++;
      if ((t + this.phase) % 60 === 0) {
        const d = Math.abs(dx);
        if (dir !== 0 && d > this.progD - 10) this.tankStuck = Math.max(this.tankStuck, 60) + 30;
        else if (d < this.progD - 10) this.tankStuck = 0;
        this.progD = d;
      }
      if ((this.tankStuck > 8 || tgt.cy < cy - 60) && k.fuel > 20) buttons |= BTN_UP;
      // Lead with the vulcan's flight time; shells drop, so lift them.
      const lead = dist / SMG_SPEED;
      const ax = tgt.cx + tgt.body.vx * lead;
      const ay = tgt.cy + tgt.body.vy * lead * 0.5;
      cmd.aim = quantizeAim(Math.atan2(ay - cy, ax - cx) + (this.rng.next() - 0.5) * 2 * this.noise);
      // Close but out of sight (a floor or wall between): shell toward it to
      // open a way; still nothing after a while, go on foot and dig.
      this.blind = !this.seeTarget && dist < 240 ? this.blind + 1 : 0;
      if (this.blind > 60 && k.cannonCd <= 0) {
        cmd.aim = quantizeAim(Math.atan2(tgt.cy - cy, tgt.cx - cx));
        buttons |= BTN_SCOPE;
      } else if (this.tankStuck > 45 && dir !== 0) {
        // Treads and jets get nowhere: shell a way through, ahead and a little down.
        cmd.aim = quantizeAim(dir > 0 ? 0.25 : Math.PI - 0.25);
        buttons |= BTN_SCOPE;
      } else if (t >= this.holdFire && this.seeTarget && dist < 380) {
        buttons |= BTN_FIRE;
        const sl = dist / CANNON_SPEED;
        const lift = 0.5 * GRAVITY * PROJ[4].gravity * sl * sl;
        if (dist > 60 && Math.abs(Math.atan2(ay - lift - cy, Math.abs(ax - cx))) < 1.1) {
          cmd.aim = quantizeAim(Math.atan2(ay - lift - cy, ax - cx));
          buttons |= BTN_SCOPE;
        }
      }
    } else this.tankStuck = 0;
    cmd.buttons = buttons;
    const bail = (this.tankStuck > 240 || this.blind > 360) && (t & 7) === 0;
    if (bail) {
      this.tankStuck = 0;
      this.blind = 0;
      this.abandoned = p.tank;
      this.abandonUntil = t + 30 * 30;
    }
    cmd.inv = invByte(p.slot, p.invVersion, bail);
    return cmd;
  }
}

/** Is the straight line between two points free of terrain? (2-cell steps) */
function clearLine(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > MAX_SHOT) return false;
  const n = Math.ceil(len / 2);
  const t = world.terrain;
  for (let i = 2; i < n; i++) {
    if (t.isSolid(Math.floor(x0 + (dx * i) / n), Math.floor(y0 + (dy * i) / n))) return false;
  }
  return true;
}

/** The solid cell nearest a clone's body (biased toward `dir`), excluding the floor under it. */
function nearestBlock(world: World, p: Player, dir: number): { x: number; y: number } | null {
  const t = world.terrain;
  const bx = Math.floor(p.body.x);
  const by = Math.floor(p.body.y);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = by - 6; y <= by + 13; y++) {
    for (let x = bx - 7; x <= bx + 14; x++) {
      if (!t.isSolid(x, y)) continue;
      const dx = x - (bx + 4);
      const dy = y - (by + 7);
      const d = dx * dx + dy * dy - dir * dx * 4;
      if (d < bestD) {
        bestD = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return best;
}
