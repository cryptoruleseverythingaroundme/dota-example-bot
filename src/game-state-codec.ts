import type { RawData } from "ws";
import type {
  AbilitySnapshot,
  ArrowSnapshot,
  BuildingSnapshot,
  Faction,
  GameEvent,
  GameStateSnapshot,
  HeroScoreboardEntry,
  Lane,
  UnitSnapshot,
  ZoneSnapshot,
} from "./types.js";

const UNIT_TYPES = ["footman", "archer", "grunt", "troll", "mage", "ogre", "skeleton", "dragon"] as const;
const FACTIONS = ["human", "orc"] as const;
const UNIT_STATES = ["moving", "attacking"] as const;
const LANES = ["top", "mid", "bot"] as const;
const BUILDING_TYPES = ["base", "tower"] as const;
const EVENT_TYPES = [
  "hit",
  "death",
  "spawn",
  "attack",
  "game_over",
  "level_up",
  "cleave",
  "divine_shield",
  "thorns",
  "bloodlust",
  "critical_strike",
  "recall",
  "fireball",
  "tornado_cast",
  "raise_skeleton",
  "mega_creeps",
  "ping",
  "sudden_death",
  "dragon_spawn",
  "ring_of_healing",
  "soul_harvest",
];
const HERO_CLASSES = ["melee", "ranged", "mage"] as const;

export function parseGameStateSnapshot(data: RawData | string): GameStateSnapshot | null {
  const text = typeof data === "string" ? data : data.toString();

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const gameId = numberOrNull(parsed.gameId);
  const tick = numberOrNull(parsed.tick);
  const winner = decodeFactionOrNull(parsed.winner);
  const agentCount = numberOrNull(parsed.agentCount);
  const unitsInput = arrayOrNull(parsed.units);
  const buildingsInput = arrayOrNull(parsed.buildings);
  const arrowsInput = arrayOrNull(parsed.arrows);
  const eventsInput = arrayOrNull(parsed.events);

  if (
    gameId === null ||
    tick === null ||
    winner === undefined ||
    agentCount === null ||
    unitsInput === null ||
    buildingsInput === null ||
    arrowsInput === null ||
    eventsInput === null
  ) {
    return null;
  }

  const snapshot: GameStateSnapshot = {
    gameId,
    tick,
    units: decodeUnits(unitsInput),
    buildings: decodeBuildings(buildingsInput),
    arrows: decodeArrows(arrowsInput),
    events: decodeEvents(eventsInput),
    winner,
    agentCount,
  };

  const zonesInput = arrayOrNull(parsed.zones);

  if (zonesInput) {
    snapshot.zones = decodeZones(zonesInput);
  }

  const agentNames = decodeAgentNames(parsed.agentNames);

  if (agentNames) {
    snapshot.agentNames = agentNames;
  }

  const heroScoreboardInput = arrayOrNull(parsed.heroScoreboard);

  if (heroScoreboardInput) {
    snapshot.heroScoreboard = decodeHeroScoreboard(heroScoreboardInput);
  }

  const dragonRespawn = decodeDragonRespawn(parsed.dragonRespawn);

  if (dragonRespawn) {
    snapshot.dragonRespawn = dragonRespawn;
  }

  return snapshot;
}

function decodeUnits(values: unknown[]): UnitSnapshot[] {
  return values
    .map((value) => decodeUnit(value))
    .filter((value): value is UnitSnapshot => value !== null);
}

function decodeUnit(value: unknown): UnitSnapshot | null {
  if (Array.isArray(value)) {
    return decodeCompactUnit(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const faction = decodeFaction(value.faction);
  const lane = decodeLane(value.lane);
  const state = decodeUnitState(value.state);
  const id = numberOrNull(value.id);
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);
  const hp = numberOrNull(value.hp);
  const maxHp = numberOrNull(value.maxHp);
  const dirIndex = numberOrNull(value.dirIndex);
  const type = stringOrNull(value.type);

  if (
    !faction ||
    !lane ||
    !state ||
    id === null ||
    x === null ||
    y === null ||
    hp === null ||
    maxHp === null ||
    dirIndex === null ||
    type === null
  ) {
    return null;
  }

  return {
    ...value,
    id,
    type,
    faction,
    x,
    y,
    hp,
    maxHp,
    state,
    dirIndex,
    lane,
    abilities: Array.isArray(value.abilities) ? decodeAbilities(value.abilities) : undefined,
  };
}

function decodeCompactUnit(value: unknown[]): UnitSnapshot | null {
  const id = numberOrNull(value[0]);
  const type = indexedValue(UNIT_TYPES, value[1]);
  const faction = indexedValue(FACTIONS, value[2]);
  const x = numberOrNull(value[3]);
  const y = numberOrNull(value[4]);
  const hp = numberOrNull(value[5]);
  const maxHp = numberOrNull(value[6]);
  const state = indexedValue(UNIT_STATES, value[7]);
  const dirIndex = numberOrNull(value[8]);
  const lane = indexedValue(LANES, value[9]);
  const flags = numberOrNull(value[10]) ?? 0;

  if (
    id === null ||
    !type ||
    !faction ||
    x === null ||
    y === null ||
    hp === null ||
    maxHp === null ||
    !state ||
    dirIndex === null ||
    !lane
  ) {
    return null;
  }

  const unit: UnitSnapshot = {
    id,
    type,
    faction,
    x,
    y,
    hp,
    maxHp,
    state,
    dirIndex,
    lane,
  };

  if (hasFlag(flags, 1)) {
    unit.shielded = true;
  }

  if (hasFlag(flags, 2)) {
    unit.recallShielded = true;
  }

  if (hasFlag(flags, 4)) {
    unit.bloodlusted = true;
  }

  if (hasFlag(flags, 16)) {
    unit.inDefensiveAura = true;
  }

  if (hasFlag(flags, 32)) {
    unit.sprinting = true;
  }

  if (hasFlag(flags, 64)) {
    unit.strolling = true;
  }

  if (!hasFlag(flags, 8)) {
    return unit;
  }

  unit.isHero = true;
  unit.ownerName = stringOrUndefined(value[11]);

  if (value.length <= 12) {
    return unit;
  }

  unit.colorIndex = numberOrUndefined(value[12]);
  unit.heroLevel = numberOrUndefined(value[13]);
  unit.heroXp = numberOrUndefined(value[14]);
  unit.heroXpToNext = numberOrUndefined(value[15]);
  unit.heroDamage = numberOrUndefined(value[16]);

  if (Array.isArray(value[17])) {
    unit.abilities = value[17]
      .map((ability) => decodeCompactUnitAbility(ability))
      .filter((ability): ability is AbilitySnapshot => ability !== null);
  }

  const skin = stringOrNull(value[18]);

  if (skin) {
    unit.skin = skin;
  }

  if (value[19] !== null && value[19] !== undefined) {
    unit.waypointIndex = numberOrUndefined(value[19]);
  }

  return unit;
}

function decodeBuildings(values: unknown[]): BuildingSnapshot[] {
  return values
    .map((value) => decodeBuilding(value))
    .filter((value): value is BuildingSnapshot => value !== null);
}

function decodeBuilding(value: unknown): BuildingSnapshot | null {
  if (Array.isArray(value)) {
    const id = numberOrNull(value[0]);
    const faction = indexedValue(FACTIONS, value[1]);
    const type = indexedValue(BUILDING_TYPES, value[2]);
    const x = numberOrNull(value[3]);
    const y = numberOrNull(value[4]);
    const hp = numberOrNull(value[5]);
    const maxHp = numberOrNull(value[6]);

    if (id === null || !faction || !type || x === null || y === null || hp === null || maxHp === null) {
      return null;
    }

    const building: BuildingSnapshot = {
      id,
      faction,
      type,
      x,
      y,
      hp,
      maxHp,
    };

    const laneIndex = numberOrNull(value[7]);

    if (laneIndex !== null && laneIndex >= 0) {
      const lane = indexedValue(LANES, laneIndex);

      if (lane) {
        building.lane = lane;
      }
    }

    return building;
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = numberOrNull(value.id);
  const faction = decodeFaction(value.faction);
  const type = stringOrNull(value.type);
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);
  const hp = numberOrNull(value.hp);
  const maxHp = numberOrNull(value.maxHp);
  const lane = value.lane === undefined ? undefined : decodeLane(value.lane);

  if (
    id === null ||
    !faction ||
    type === null ||
    x === null ||
    y === null ||
    hp === null ||
    maxHp === null ||
    lane === null
  ) {
    return null;
  }

  return {
    ...value,
    id,
    faction,
    type,
    x,
    y,
    hp,
    maxHp,
    lane,
  };
}

function decodeArrows(values: unknown[]): ArrowSnapshot[] {
  return values
    .map((value) => decodeArrow(value))
    .filter((value): value is ArrowSnapshot => value !== null);
}

function decodeArrow(value: unknown): ArrowSnapshot | null {
  if (Array.isArray(value)) {
    const id = numberOrNull(value[0]);
    const faction = indexedValue(FACTIONS, value[1]);
    const x = numberOrNull(value[2]);
    const y = numberOrNull(value[3]);
    const angle = numberOrNull(value[4]);
    const flags = numberOrNull(value[5]) ?? 0;

    if (id === null || !faction || x === null || y === null || angle === null) {
      return null;
    }

    const arrow: ArrowSnapshot = {
      id,
      faction,
      x,
      y,
      angle,
    };

    if (hasFlag(flags, 1)) {
      arrow.fromBuilding = true;
    }

    if (hasFlag(flags, 2)) {
      arrow.fromHero = true;
      const colorIndex = numberOrNull(value[6]);

      if (colorIndex !== null && colorIndex >= 0) {
        arrow.colorIndex = colorIndex;
      }
    }

    const projectile = stringOrUndefined(value[7]);

    if (projectile) {
      arrow.projectile = projectile;
    }

    const casterSkin = stringOrUndefined(value[8]);

    if (casterSkin) {
      arrow.casterSkin = casterSkin;
    }

    return arrow;
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = numberOrNull(value.id);
  const faction = decodeFaction(value.faction);
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);
  const angle = numberOrNull(value.angle);

  if (id === null || !faction || x === null || y === null || angle === null) {
    return null;
  }

  return {
    ...value,
    id,
    faction,
    x,
    y,
    angle,
  };
}

function decodeEvents(values: unknown[]): GameEvent[] {
  return values
    .map((value) => decodeEvent(value))
    .filter((value): value is GameEvent => value !== null);
}

function decodeEvent(value: unknown): GameEvent | null {
  if (Array.isArray(value)) {
    const type = indexedValue(EVENT_TYPES, value[0]);
    const unitId = numberOrNull(value[1]);
    const x = numberOrNull(value[2]);
    const y = numberOrNull(value[3]);

    if (!type || unitId === null || x === null || y === null) {
      return null;
    }

    const event: GameEvent = {
      type,
      unitId,
      x,
      y,
    };

    if (value.length <= 4) {
      return event;
    }

    if (type === "game_over") {
      const winner = indexedValue(FACTIONS, value[4]);

      if (winner) {
        event.winner = winner;
      }

      return event;
    }

    if (type === "cleave" || type === "ring_of_healing" || type === "fireball") {
      if (Array.isArray(value[4])) {
        event.targetIds = value[4].filter((targetId): targetId is number => typeof targetId === "number");
      }

      if (type === "fireball") {
        const casterSkin = stringOrUndefined(value[5]);

        if (casterSkin) {
          event.casterSkin = casterSkin;
        }
      }

      return event;
    }

    if (type === "thorns" || type === "critical_strike" || type === "soul_harvest") {
      event.damage = numberOrUndefined(value[4]);
      return event;
    }

    if (type === "ping") {
      event.pingType = stringOrUndefined(value[4]);
      event.pingerName = stringOrUndefined(value[5]);
      const faction = indexedValue(FACTIONS, value[6]);

      if (faction) {
        event.pingerFaction = faction;
      }
    }

    return event;
  }

  if (!isRecord(value)) {
    return null;
  }

  const type = stringOrNull(value.type);
  const unitId = numberOrNull(value.unitId);
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);
  const winner = value.winner === undefined ? undefined : decodeFaction(value.winner) ?? undefined;
  const pingerFaction =
    value.pingerFaction === undefined ? undefined : decodeFaction(value.pingerFaction) ?? undefined;

  if (type === null || unitId === null || x === null || y === null) {
    return null;
  }

  return {
    ...value,
    type,
    unitId,
    x,
    y,
    winner,
    pingerFaction,
  };
}

function decodeHeroScoreboard(values: unknown[]): HeroScoreboardEntry[] {
  return values
    .map((value) => decodeHeroScoreboardEntry(value))
    .filter((value): value is HeroScoreboardEntry => value !== null);
}

function decodeHeroScoreboardEntry(value: unknown): HeroScoreboardEntry | null {
  if (Array.isArray(value)) {
    const name = stringOrNull(value[0]);
    const faction = indexedValue(FACTIONS, value[1]);
    const heroClass = indexedValue(HERO_CLASSES, value[2]);
    const lane = indexedValue(LANES, value[3]);
    const level = numberOrNull(value[4]);
    const xp = numberOrNull(value[5]);
    const xpToNext = numberOrNull(value[6]);
    const hp = numberOrNull(value[7]);
    const maxHp = numberOrNull(value[8]);
    const damage = numberOrNull(value[9]);
    const alive = value[10] === 1;
    const colorIndex = numberOrNull(value[12]);
    const flags = numberOrNull(value[17]) ?? 0;
    const totalDamage = numberOrNull(value[18]);
    const mmr = numberOrUndefined(value[20]);
    const rankedWins = numberOrUndefined(value[21]);
    const rankedLosses = numberOrUndefined(value[22]);
    const rank = numberOrUndefined(value[24]);
    const kills = numberOrUndefined(value[25]);
    const deaths = numberOrUndefined(value[26]);
    const assists = numberOrUndefined(value[27]);
    const sprintRemainingMs = numberOrUndefined(value[32]);
    const sprintCooldownMs = numberOrUndefined(value[33]);
    const strollRemainingMs = numberOrUndefined(value[34]);
    const strollCooldownMs = numberOrUndefined(value[35]);

    if (
      name === null ||
      !faction ||
      !heroClass ||
      !lane ||
      level === null ||
      xp === null ||
      xpToNext === null ||
      hp === null ||
      maxHp === null ||
      damage === null ||
      colorIndex === null
    ) {
      return null;
    }

    const abilities = Array.isArray(value[13]) ? decodeAbilities(value[13]) : [];
    const entry: HeroScoreboardEntry = {
      name,
      faction,
      heroClass,
      lane,
      level,
      xp,
      xpToNext,
      hp,
      maxHp,
      damage,
      alive,
      colorIndex,
      abilities,
    };

    const respawnTimer = numberOrNull(value[11]);

    if (respawnTimer !== null && respawnTimer >= 0) {
      entry.respawnTimer = respawnTimer;
    }

    const pfpUrl = stringOrUndefined(value[14]);

    if (pfpUrl) {
      entry.pfpUrl = pfpUrl;
    }

    const profileUrl = stringOrUndefined(value[15]);

    if (profileUrl) {
      entry.profileUrl = profileUrl;
    }

    const recallCooldownMs = numberOrNull(value[16]);

    if (recallCooldownMs !== null && recallCooldownMs >= 0) {
      entry.recallCooldownMs = recallCooldownMs;
    }

    if (hasFlag(flags, 1)) {
      entry.tokenHolder = true;
    }

    if (hasFlag(flags, 2)) {
      entry.isAI = true;
    }

    if (hasFlag(flags, 4)) {
      entry.ringOfRegen = true;
    }

    if (totalDamage !== null) {
      entry.totalDamage = totalDamage;
    }

    if (Array.isArray(value[19])) {
      entry.abilityChoices = value[19].filter((choice): choice is string => typeof choice === "string");
    }

    if (mmr !== undefined) {
      entry.mmr = mmr;
    }

    if (rankedWins !== undefined) {
      entry.rankedWins = rankedWins;
    }

    if (rankedLosses !== undefined) {
      entry.rankedLosses = rankedLosses;
    }

    const skin = stringOrNull(value[23]);
    entry.skin = skin ?? null;

    const equippedItem = stringOrNull(value[28]);

    if (equippedItem !== null) {
      entry.equippedItem = equippedItem;
    }

    const ratSkullStacks = numberOrUndefined(value[29]);

    if (ratSkullStacks !== undefined) {
      entry.ratSkullStacks = ratSkullStacks;
    }

    const soulHarvestStacks = numberOrUndefined(value[30]);

    if (soulHarvestStacks !== undefined) {
      entry.soulHarvestStacks = soulHarvestStacks;
    }

    const soulHarvestStackCap = numberOrUndefined(value[31]);

    if (soulHarvestStackCap !== undefined) {
      entry.soulHarvestStackCap = soulHarvestStackCap;
    }

    if (rank !== undefined) {
      entry.rank = rank;
    }

    if (kills !== undefined) {
      entry.kills = kills;
    }

    if (deaths !== undefined) {
      entry.deaths = deaths;
    }

    if (assists !== undefined) {
      entry.assists = assists;
    }

    if (sprintRemainingMs !== undefined) {
      entry.sprintRemainingMs = sprintRemainingMs;
    }

    if (sprintCooldownMs !== undefined) {
      entry.sprintCooldownMs = sprintCooldownMs;
    }

    if (strollRemainingMs !== undefined) {
      entry.strollRemainingMs = strollRemainingMs;
    }

    if (strollCooldownMs !== undefined) {
      entry.strollCooldownMs = strollCooldownMs;
    }

    return entry;
  }

  if (!isRecord(value)) {
    return null;
  }

  const name = stringOrNull(value.name);
  const faction = decodeFaction(value.faction);
  const heroClass = indexedValue(HERO_CLASSES, value.heroClass);
  const lane = decodeLane(value.lane);
  const level = numberOrNull(value.level);
  const xp = numberOrNull(value.xp);
  const xpToNext = numberOrNull(value.xpToNext);
  const hp = numberOrNull(value.hp);
  const maxHp = numberOrNull(value.maxHp);
  const damage = numberOrNull(value.damage);
  const alive = typeof value.alive === "boolean" ? value.alive : null;
  const colorIndex = numberOrNull(value.colorIndex);

  if (
    name === null ||
    !faction ||
    !heroClass ||
    !lane ||
    level === null ||
    xp === null ||
    xpToNext === null ||
    hp === null ||
    maxHp === null ||
    damage === null ||
    alive === null ||
    colorIndex === null
  ) {
    return null;
  }

  return {
    ...value,
    name,
    faction,
    heroClass,
    lane,
    level,
    xp,
    xpToNext,
    hp,
    maxHp,
    damage,
    alive,
    colorIndex,
    abilities: Array.isArray(value.abilities) ? decodeAbilities(value.abilities) : [],
    recallCooldownMs: numberOrUndefined(value.recallCooldownMs),
    sprintRemainingMs: numberOrUndefined(value.sprintRemainingMs),
    sprintCooldownMs: numberOrUndefined(value.sprintCooldownMs),
    strollRemainingMs: numberOrUndefined(value.strollRemainingMs),
    strollCooldownMs: numberOrUndefined(value.strollCooldownMs),
    equippedItem: stringOrNull(value.equippedItem) ?? undefined,
    ratSkullStacks: numberOrUndefined(value.ratSkullStacks),
    soulHarvestStacks: numberOrUndefined(value.soulHarvestStacks),
    soulHarvestStackCap: numberOrUndefined(value.soulHarvestStackCap),
  };
}

function decodeAbilities(values: unknown[]): AbilitySnapshot[] {
  return values
    .map((value) => decodeAbility(value))
    .filter((value): value is AbilitySnapshot => value !== null);
}

function decodeAbility(value: unknown): AbilitySnapshot | null {
  if (Array.isArray(value)) {
    return decodeCompactAbility(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = stringOrNull(value.id);
  const level = numberOrNull(value.level);

  if (id === null || level === null) {
    return null;
  }

  return {
    ...value,
    id,
    level,
    cooldownRemaining: numberOrUndefined(value.cooldownRemaining),
    cooldownTotal: numberOrUndefined(value.cooldownTotal),
    activeRemaining: numberOrUndefined(value.activeRemaining),
  };
}

function decodeCompactAbility(value: unknown[]): AbilitySnapshot | null {
  const id = stringOrNull(value[0]);
  const level = numberOrNull(value[1]);

  if (id === null || level === null) {
    return null;
  }

  const ability: AbilitySnapshot = {
    id,
    level,
  };

  const cooldownRemaining = numberOrNull(value[2]);
  const cooldownTotal = numberOrNull(value[3]);
  const activeRemaining = numberOrNull(value[4]);

  if (cooldownRemaining !== null && cooldownRemaining >= 0) {
    ability.cooldownRemaining = cooldownRemaining;
  }

  if (cooldownTotal !== null && cooldownTotal >= 0) {
    ability.cooldownTotal = cooldownTotal;
  }

  if (activeRemaining !== null && activeRemaining >= 0) {
    ability.activeRemaining = activeRemaining;
  }

  return ability;
}

function decodeCompactUnitAbility(value: unknown): AbilitySnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const id = stringOrNull(value[0]);
  const level = numberOrNull(value[1]);

  if (id === null || level === null) {
    return null;
  }

  return {
    id,
    level,
  };
}

function decodeZones(values: unknown[]): ZoneSnapshot[] {
  return values
    .map((value) => decodeZone(value))
    .filter((value): value is ZoneSnapshot => value !== null);
}

function decodeZone(value: unknown): ZoneSnapshot | null {
  if (Array.isArray(value)) {
    const id = numberOrNull(value[0]);
    const type = stringOrNull(value[1]);
    const x = numberOrNull(value[2]);
    const y = numberOrNull(value[3]);

    if (id === null || type === null || x === null || y === null) {
      return null;
    }

    return {
      id,
      type,
      x,
      y,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = numberOrNull(value.id);
  const type = stringOrNull(value.type);
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);

  if (id === null || type === null || x === null || y === null) {
    return null;
  }

  return {
    ...value,
    id,
    type,
    x,
    y,
  };
}

function decodeAgentNames(value: unknown): { human: string[]; orc: string[] } | null {
  if (!isRecord(value)) {
    return null;
  }

  const human = Array.isArray(value.human) ? value.human.filter((name): name is string => typeof name === "string") : [];
  const orc = Array.isArray(value.orc) ? value.orc.filter((name): name is string => typeof name === "string") : [];

  return {
    human,
    orc,
  };
}

function decodeDragonRespawn(value: unknown): { human?: number; orc?: number } | null {
  if (!isRecord(value)) {
    return null;
  }

  const human = numberOrUndefined(value.human);
  const orc = numberOrUndefined(value.orc);

  if (human === undefined && orc === undefined) {
    return null;
  }

  return {
    human,
    orc,
  };
}

function decodeFaction(value: unknown): Faction | null {
  if (typeof value === "string") {
    return value === "human" || value === "orc" ? value : null;
  }

  return indexedValue(FACTIONS, value) ?? null;
}

function decodeFactionOrNull(value: unknown): Faction | null | undefined {
  if (value === null) {
    return null;
  }

  return decodeFaction(value);
}

function decodeLane(value: unknown): Lane | null {
  if (typeof value === "string") {
    return value === "top" || value === "mid" || value === "bot" ? value : null;
  }

  return indexedValue(LANES, value) ?? null;
}

function decodeUnitState(value: unknown): UnitSnapshot["state"] | null {
  if (value === "moving" || value === "attacking") {
    return value;
  }

  return indexedValue(UNIT_STATES, value) ?? null;
}

function indexedValue<T extends readonly string[]>(values: T, index: unknown): T[number] | null {
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < values.length
    ? values[index]
    : null;
}

function arrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasFlag(value: number, flag: number): boolean {
  return (value & flag) === flag;
}
