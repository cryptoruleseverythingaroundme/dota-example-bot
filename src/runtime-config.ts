import { readFile } from "node:fs/promises";
import { config as loadDotEnv } from "dotenv";
import type { HeroClass } from "./types.js";

interface FileConfig {
  abilities: string[];
  decisionIntervalMs: number;
  websocketUrl: string;
  heroClass: HeroClass;
  skin: string | null;
}

export interface RuntimeConfig extends FileConfig {
  apiBaseUrl: string;
  botName: string;
  apiKey: string;
  preferredGameId: number | null;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  loadDotEnv();

  const botName = requireEnv("BOT_NAME");
  const apiKey = requireEnv("API_KEY");
  const config = await loadFileConfig();

  return {
    ...config,
    apiBaseUrl: deriveApiBaseUrl(config.websocketUrl),
    apiKey,
    botName,
    preferredGameId: derivePreferredGameId(config.websocketUrl),
  };
}

async function loadFileConfig(): Promise<FileConfig> {
  const configUrl = new URL("../config.json", import.meta.url);
  const rawConfig = await readFile(configUrl, "utf8");
  const parsedConfig = JSON.parse(rawConfig) as Partial<FileConfig>;

  if (
    !Array.isArray(parsedConfig.abilities) ||
    parsedConfig.abilities.length === 0 ||
    parsedConfig.abilities.some((ability) => typeof ability !== "string" || ability.length === 0)
  ) {
    throw new Error("config.json must include a non-empty abilities string array");
  }

  if (
    typeof parsedConfig.decisionIntervalMs !== "number" ||
    parsedConfig.decisionIntervalMs <= 0
  ) {
    throw new Error("config.json must include a positive decisionIntervalMs number");
  }

  if (
    typeof parsedConfig.websocketUrl !== "string" ||
    parsedConfig.websocketUrl.length === 0
  ) {
    throw new Error("config.json must include a websocketUrl string");
  }

  if (!isHeroClass(parsedConfig.heroClass)) {
    throw new Error('config.json must include heroClass: "melee" | "ranged" | "mage"');
  }

  if (
    parsedConfig.skin !== null &&
    typeof parsedConfig.skin !== "string"
  ) {
    throw new Error("config.json skin must be a string or null");
  }

  return {
    abilities: parsedConfig.abilities,
    decisionIntervalMs: parsedConfig.decisionIntervalMs,
    heroClass: parsedConfig.heroClass,
    skin: parsedConfig.skin,
    websocketUrl: parsedConfig.websocketUrl,
  };
}

function requireEnv(name: "BOT_NAME" | "API_KEY"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function deriveApiBaseUrl(websocketUrl: string): string {
  const url = new URL(websocketUrl);
  const protocol = url.protocol === "wss:" ? "https:" : "http:";
  return `${protocol}//${url.host}`;
}

function derivePreferredGameId(websocketUrl: string): number | null {
  const url = new URL(websocketUrl);
  const rawGameId = url.searchParams.get("game");

  if (!rawGameId) {
    return null;
  }

  const gameId = Number(rawGameId);
  return Number.isInteger(gameId) && gameId > 0 ? gameId : null;
}

function isHeroClass(value: unknown): value is HeroClass {
  return value === "melee" || value === "ranged" || value === "mage";
}
