import type {
  ArrowSnapshot,
  BuildingSnapshot,
  Faction,
  FactionMap,
  GameEvent,
  GameStateSnapshot,
  HeroScoreboardEntry,
  LaneMap,
  UnitSnapshot,
  ZoneSnapshot,
} from "../types.js";

export interface DecisionSnapshot {
  meta: {
    gameId: number;
    tick: number;
    winner: Faction | null;
    agentCount: number;
    agentNames: FactionMap<string[]>;
    dragonRespawnSeconds: FactionMap<number | null>;
  };
  self: {
    botName: string;
    faction: Faction | null;
    unit: UnitSnapshot | null;
    scoreboard: HeroScoreboardEntry | null;
  };
  units: {
    all: UnitSnapshot[];
    byId: Record<number, UnitSnapshot>;
    byFaction: FactionMap<UnitSnapshot[]>;
    byLane: LaneMap<UnitSnapshot[]>;
    heroes: {
      all: UnitSnapshot[];
      byOwnerName: Record<string, UnitSnapshot>;
      byFaction: FactionMap<UnitSnapshot[]>;
      byLane: LaneMap<UnitSnapshot[]>;
    };
    nonHeroes: {
      all: UnitSnapshot[];
      byFaction: FactionMap<UnitSnapshot[]>;
      byLane: LaneMap<UnitSnapshot[]>;
    };
  };
  buildings: {
    all: BuildingSnapshot[];
    byId: Record<number, BuildingSnapshot>;
    bases: FactionMap<BuildingSnapshot | null>;
    towers: FactionMap<LaneMap<BuildingSnapshot | null>>;
  };
  arrows: {
    all: ArrowSnapshot[];
    byId: Record<number, ArrowSnapshot>;
    byFaction: FactionMap<ArrowSnapshot[]>;
    fromHeroes: ArrowSnapshot[];
    fromBuildings: ArrowSnapshot[];
  };
  zones: {
    all: ZoneSnapshot[];
    byId: Record<number, ZoneSnapshot>;
    byType: Record<string, ZoneSnapshot[]>;
  };
  events: {
    all: GameEvent[];
    byType: Record<string, GameEvent[]>;
    pings: {
      top: GameEvent[];
      mid: GameEvent[];
      bot: GameEvent[];
      defend: GameEvent[];
      other: GameEvent[];
    };
  };
  scoreboard: {
    all: HeroScoreboardEntry[];
    byName: Record<string, HeroScoreboardEntry>;
    byFaction: FactionMap<HeroScoreboardEntry[]>;
    byLane: LaneMap<HeroScoreboardEntry[]>;
    withAbilityChoices: HeroScoreboardEntry[];
  };
}

export function buildDecisionSnapshot(
  botName: string,
  rawSnapshot: GameStateSnapshot,
): DecisionSnapshot {
  const unitsByFaction = emptyFactionBuckets<UnitSnapshot>();
  const unitsByLane = emptyLaneBuckets<UnitSnapshot>();
  const heroUnitsByFaction = emptyFactionBuckets<UnitSnapshot>();
  const heroUnitsByLane = emptyLaneBuckets<UnitSnapshot>();
  const nonHeroUnitsByFaction = emptyFactionBuckets<UnitSnapshot>();
  const nonHeroUnitsByLane = emptyLaneBuckets<UnitSnapshot>();
  const unitsById: Record<number, UnitSnapshot> = {};
  const heroUnitsByOwnerName: Record<string, UnitSnapshot> = {};

  for (const unit of rawSnapshot.units) {
    unitsById[unit.id] = unit;
    unitsByFaction[unit.faction].push(unit);
    unitsByLane[unit.lane].push(unit);

    if (unit.isHero) {
      heroUnitsByFaction[unit.faction].push(unit);
      heroUnitsByLane[unit.lane].push(unit);

      if (unit.ownerName) {
        heroUnitsByOwnerName[unit.ownerName] = unit;
      }
    } else {
      nonHeroUnitsByFaction[unit.faction].push(unit);
      nonHeroUnitsByLane[unit.lane].push(unit);
    }
  }

  const bases: FactionMap<BuildingSnapshot | null> = {
    human: null,
    orc: null,
  };
  const towers: FactionMap<LaneMap<BuildingSnapshot | null>> = {
    human: emptyLaneValueMap<BuildingSnapshot | null>(null),
    orc: emptyLaneValueMap<BuildingSnapshot | null>(null),
  };
  const buildingsById: Record<number, BuildingSnapshot> = {};

  for (const building of rawSnapshot.buildings) {
    buildingsById[building.id] = building;

    if (building.type === "base") {
      bases[building.faction] = building;
      continue;
    }

    if (building.type === "tower" && building.lane) {
      towers[building.faction][building.lane] = building;
    }
  }

  const arrowsById: Record<number, ArrowSnapshot> = {};
  const arrowsByFaction = emptyFactionBuckets<ArrowSnapshot>();
  const arrowsFromHeroes: ArrowSnapshot[] = [];
  const arrowsFromBuildings: ArrowSnapshot[] = [];

  for (const arrow of rawSnapshot.arrows) {
    arrowsById[arrow.id] = arrow;
    arrowsByFaction[arrow.faction].push(arrow);

    if (arrow.fromHero) {
      arrowsFromHeroes.push(arrow);
    }

    if (arrow.fromBuilding) {
      arrowsFromBuildings.push(arrow);
    }
  }

  const zones = rawSnapshot.zones ?? [];
  const zonesById: Record<number, ZoneSnapshot> = {};
  const zonesByType: Record<string, ZoneSnapshot[]> = {};

  for (const zone of zones) {
    zonesById[zone.id] = zone;
    pushToRecordArray(zonesByType, zone.type, zone);
  }

  const eventsByType: Record<string, GameEvent[]> = {};
  const pingEvents = {
    top: [] as GameEvent[],
    mid: [] as GameEvent[],
    bot: [] as GameEvent[],
    defend: [] as GameEvent[],
    other: [] as GameEvent[],
  };

  for (const event of rawSnapshot.events) {
    pushToRecordArray(eventsByType, event.type, event);

    if (event.type !== "ping") {
      continue;
    }

    switch (event.pingType) {
      case "top":
        pingEvents.top.push(event);
        break;
      case "mid":
        pingEvents.mid.push(event);
        break;
      case "bot":
        pingEvents.bot.push(event);
        break;
      case "defend":
      case "base":
        pingEvents.defend.push(event);
        break;
      default:
        pingEvents.other.push(event);
        break;
    }
  }

  const scoreboardEntries = rawSnapshot.heroScoreboard ?? [];
  const scoreboardByName: Record<string, HeroScoreboardEntry> = {};
  const scoreboardByFaction = emptyFactionBuckets<HeroScoreboardEntry>();
  const scoreboardByLane = emptyLaneBuckets<HeroScoreboardEntry>();
  const scoreboardWithAbilityChoices: HeroScoreboardEntry[] = [];

  for (const entry of scoreboardEntries) {
    scoreboardByName[entry.name] = entry;
    scoreboardByFaction[entry.faction].push(entry);
    scoreboardByLane[entry.lane].push(entry);

    if (entry.abilityChoices && entry.abilityChoices.length > 0) {
      scoreboardWithAbilityChoices.push(entry);
    }
  }

  const selfUnit =
    findByCaseInsensitiveName(rawSnapshot.units, botName, (unit) => unit.ownerName) ?? null;
  const selfScoreboard =
    findByCaseInsensitiveName(scoreboardEntries, botName, (entry) => entry.name) ?? null;

  return {
    meta: {
      gameId: rawSnapshot.gameId,
      tick: rawSnapshot.tick,
      winner: rawSnapshot.winner,
      agentCount: rawSnapshot.agentCount,
      agentNames: {
        human: rawSnapshot.agentNames?.human ?? [],
        orc: rawSnapshot.agentNames?.orc ?? [],
      },
      dragonRespawnSeconds: {
        human: rawSnapshot.dragonRespawn?.human ?? null,
        orc: rawSnapshot.dragonRespawn?.orc ?? null,
      },
    },
    self: {
      botName,
      faction: selfUnit?.faction ?? selfScoreboard?.faction ?? null,
      unit: selfUnit,
      scoreboard: selfScoreboard,
    },
    units: {
      all: rawSnapshot.units,
      byId: unitsById,
      byFaction: unitsByFaction,
      byLane: unitsByLane,
      heroes: {
        all: heroUnitsByFaction.human.concat(heroUnitsByFaction.orc),
        byOwnerName: heroUnitsByOwnerName,
        byFaction: heroUnitsByFaction,
        byLane: heroUnitsByLane,
      },
      nonHeroes: {
        all: nonHeroUnitsByFaction.human.concat(nonHeroUnitsByFaction.orc),
        byFaction: nonHeroUnitsByFaction,
        byLane: nonHeroUnitsByLane,
      },
    },
    buildings: {
      all: rawSnapshot.buildings,
      byId: buildingsById,
      bases,
      towers,
    },
    arrows: {
      all: rawSnapshot.arrows,
      byId: arrowsById,
      byFaction: arrowsByFaction,
      fromHeroes: arrowsFromHeroes,
      fromBuildings: arrowsFromBuildings,
    },
    zones: {
      all: zones,
      byId: zonesById,
      byType: zonesByType,
    },
    events: {
      all: rawSnapshot.events,
      byType: eventsByType,
      pings: pingEvents,
    },
    scoreboard: {
      all: scoreboardEntries,
      byName: scoreboardByName,
      byFaction: scoreboardByFaction,
      byLane: scoreboardByLane,
      withAbilityChoices: scoreboardWithAbilityChoices,
    },
  };
}

function emptyLaneBuckets<T>(): LaneMap<T[]> {
  return {
    top: [],
    mid: [],
    bot: [],
  };
}

function emptyFactionBuckets<T>(): FactionMap<T[]> {
  return {
    human: [],
    orc: [],
  };
}

function emptyLaneValueMap<T>(initialValue: T): LaneMap<T> {
  return {
    top: initialValue,
    mid: initialValue,
    bot: initialValue,
  };
}

function pushToRecordArray<T>(record: Record<string, T[]>, key: string, value: T): void {
  if (!record[key]) {
    record[key] = [];
  }

  record[key].push(value);
}

function findByCaseInsensitiveName<T>(
  values: T[],
  name: string,
  getName: (value: T) => string | undefined,
): T | undefined {
  const targetName = name.toLowerCase();

  return values.find((value) => getName(value)?.toLowerCase() === targetName);
}
