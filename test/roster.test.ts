import { describe, expect, it } from 'vitest';
import { World } from '../src/server/world.ts';

describe('player names', () => {
  it("the BOT tag is the bots' alone (clients count humans by it)", () => {
    const world = new World(1);
    expect(world.addPlayer('BOT Sneaky', { send() {} })!.name).toBe('Sneaky');
    expect(world.addPlayer('bot  bot Rex', { send() {} })!.name).toBe('Rex');
    expect(world.addPlayer('Abbott', { send() {} })!.name).toBe('Abbott');
    expect(world.addPlayer('BOT', { send() {} })!.name).toBe('BOT');
  });
});
