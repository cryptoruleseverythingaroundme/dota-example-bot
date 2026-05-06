import type { RuntimeConfig } from "./runtime-config.js";
import { BotState } from "./state.js";
import { GameWebSocketClient } from "./websocket-client.js";
import type { GameStateSnapshot, HeroScoreboardEntry } from "./types.js";

const ABILITY_PICK_RETRY_MS = 1_000;

interface AbilityPickerOptions {
  runtimeConfig: RuntimeConfig;
  state: BotState;
  websocketClient: GameWebSocketClient;
}

interface PendingAbilityPick {
  choiceKey: string;
  ability: string;
  lastSentAt: number;
}

export class AbilityPicker {
  #lastIgnoredChoiceKey: string | null = null;
  #pendingPick: PendingAbilityPick | null = null;
  #unsubscribe: (() => void) | null = null;

  constructor(private readonly options: AbilityPickerOptions) {}

  start(): void {
    if (this.#unsubscribe) {
      return;
    }

    this.#unsubscribe = this.options.state.subscribe((snapshot) => {
      this.handleSnapshot(snapshot);
    });

    const snapshot = this.options.state.getLastSnapshot();

    if (snapshot) {
      this.handleSnapshot(snapshot);
    }
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#lastIgnoredChoiceKey = null;
    this.#pendingPick = null;
  }

  private handleSnapshot(snapshot: GameStateSnapshot): void {
    if (snapshot.winner !== null) {
      this.#lastIgnoredChoiceKey = null;
      this.#pendingPick = null;
      return;
    }

    const selfScoreboard = findSelfScoreboardEntry(snapshot, this.options.runtimeConfig.botName);

    if (!selfScoreboard || !selfScoreboard.abilityChoices || selfScoreboard.abilityChoices.length === 0) {
      this.#lastIgnoredChoiceKey = null;
      this.#pendingPick = null;
      return;
    }

    const choiceKey = selfScoreboard.abilityChoices.slice().sort().join("|");
    const selectedAbility = pickPreferredAbility(
      this.options.runtimeConfig.abilities,
      selfScoreboard.abilityChoices,
    );

    if (!selectedAbility) {
      this.#pendingPick = null;

      if (choiceKey !== this.#lastIgnoredChoiceKey) {
        console.log(
          `[ability] no preferred ability matched available=${selfScoreboard.abilityChoices.join(",")}`,
        );
        this.#lastIgnoredChoiceKey = choiceKey;
      }

      return;
    }

    this.#lastIgnoredChoiceKey = null;

    if (
      this.#pendingPick &&
      this.#pendingPick.choiceKey === choiceKey &&
      this.#pendingPick.ability === selectedAbility &&
      Date.now() - this.#pendingPick.lastSentAt < ABILITY_PICK_RETRY_MS
    ) {
      return;
    }

    const wasSent = this.options.websocketClient.sendCommand({
      type: "abilityChoice",
      ability: selectedAbility,
    });

    if (!wasSent) {
      return;
    }

    this.#pendingPick = {
      choiceKey,
      ability: selectedAbility,
      lastSentAt: Date.now(),
    };
    console.log(
      `[ability] selected ability=${selectedAbility} available=${selfScoreboard.abilityChoices.join(",")}`,
    );
  }
}

function findSelfScoreboardEntry(
  snapshot: GameStateSnapshot,
  botName: string,
): HeroScoreboardEntry | null {
  const targetName = botName.toLowerCase();

  for (const entry of snapshot.heroScoreboard ?? []) {
    if (entry.name.toLowerCase() === targetName) {
      return entry;
    }
  }

  return null;
}

function pickPreferredAbility(preferredAbilities: string[], availableAbilities: string[]): string | null {
  const availableSet = new Set(availableAbilities);

  for (const ability of preferredAbilities) {
    if (availableSet.has(ability)) {
      return ability;
    }
  }

  return null;
}
