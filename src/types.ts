export type Lane = "top" | "mid" | "bot";
export type Faction = "human" | "orc";
export type HeroClass = "melee" | "ranged" | "mage";
export interface LaneMap<T> {
  top: T;
  mid: T;
  bot: T;
}

export interface FactionMap<T> {
  human: T;
  orc: T;
}

export interface GameStateSnapshot {
  gameId: number;
  tick: number;
  units: UnitSnapshot[];
  buildings: BuildingSnapshot[];
  arrows: ArrowSnapshot[];
  zones?: ZoneSnapshot[];
  events: GameEvent[];
  winner: Faction | null;
  agentCount: number;
  agentNames?: { human: string[]; orc: string[] };
  heroScoreboard?: HeroScoreboardEntry[];
  dragonRespawn?: { human?: number; orc?: number };
}

export interface UnitSnapshot {
  id: number;
  type: string;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: "moving" | "attacking";
  dirIndex: number;
  lane: Lane;
  isHero?: boolean;
  ownerName?: string;
  colorIndex?: number;
  heroLevel?: number;
  heroXp?: number;
  heroXpToNext?: number;
  heroDamage?: number;
  abilities?: AbilitySnapshot[];
  skin?: string | null;
  waypointIndex?: number;
  shielded?: boolean;
  recallShielded?: boolean;
  bloodlusted?: boolean;
  inDefensiveAura?: boolean;
}

export interface AbilitySnapshot {
  id: string;
  level: number;
  cooldownRemaining?: number;
  cooldownTotal?: number;
  activeRemaining?: number;
}

export interface BuildingSnapshot {
  id: number;
  faction: Faction;
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  lane?: Lane;
}

export interface ArrowSnapshot {
  id: number;
  faction: Faction;
  x: number;
  y: number;
  angle: number;
  fromBuilding?: boolean;
  fromHero?: boolean;
  colorIndex?: number;
  projectile?: string;
  casterSkin?: string;
}

export interface ZoneSnapshot {
  id: number;
  type: string;
  x: number;
  y: number;
}

export interface GameEvent {
  type: string;
  unitId: number;
  x: number;
  y: number;
  pingType?: string;
  pingerName?: string;
  pingerFaction?: Faction;
  winner?: Faction;
  targetIds?: number[];
  damage?: number;
  casterSkin?: string;
}

export interface HeroScoreboardEntry {
  name: string;
  faction: Faction;
  heroClass: HeroClass;
  lane: Lane;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  damage: number;
  alive: boolean;
  respawnTimer?: number;
  colorIndex: number;
  abilities: AbilitySnapshot[];
  abilityChoices?: string[];
  pfpUrl?: string;
  profileUrl?: string;
  recallCooldownMs?: number;
  tokenHolder?: boolean;
  ringOfRegen?: boolean;
  totalDamage?: number;
  isAI?: boolean;
  mmr?: number;
  rankedWins?: number;
  rankedLosses?: number;
  skin?: string | null;
  rank?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
}

export type BotCommand =
  | { type: "recall" }
  | { type: "switchLane"; lane: Lane }
  | { type: "ping"; pingType: Lane | "base" }
  | { type: "abilityChoice"; ability: string };
