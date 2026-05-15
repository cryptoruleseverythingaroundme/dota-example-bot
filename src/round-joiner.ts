import type { RuntimeConfig } from "./runtime-config.js";
import { BotState } from "./state.js";
import { buildDecisionSnapshot } from "./strategy/decision-snapshot.js";
import type { DecisionMaker } from "./strategy/decision-loop.js";
import { StrategyApiClient } from "./strategy-api-client.js";
import type { GameStateSnapshot, Lane } from "./types.js";

const JOIN_RETRY_DELAY_MS = 5_000;
const FALLBACK_JOIN_LANE: Lane = "mid";

interface RoundJoinerOptions {
  decisionMaker: DecisionMaker;
  runtimeConfig: RuntimeConfig;
  state: BotState;
  strategyApiClient: StrategyApiClient;
}

export class RoundJoiner {
  #currentRoundNumber = 0;
  #joinedRoundNumber: number | null = null;
  #joinInFlight = false;
  #lastTick: number | null = null;
  #lastWinner: GameStateSnapshot["winner"] | undefined;
  #nextJoinAttemptAt = 0;
  #unsubscribe: (() => void) | null = null;

  constructor(private readonly options: RoundJoinerOptions) {}

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
  }

  private handleSnapshot(snapshot: GameStateSnapshot): void {
    if (this.isNewRound(snapshot)) {
      this.#currentRoundNumber += 1;
      this.#joinedRoundNumber = null;
      console.log(`[round] new round detected tick=${snapshot.tick} round=${this.#currentRoundNumber}`);
    } else if (this.#currentRoundNumber === 0 && snapshot.winner === null) {
      this.#currentRoundNumber = 1;
      console.log(`[round] initial round detected tick=${snapshot.tick}`);
    }

    this.#lastTick = snapshot.tick;
    this.#lastWinner = snapshot.winner;

    if (snapshot.winner !== null || this.#currentRoundNumber === 0) {
      return;
    }

    void this.maybeJoinRound(snapshot, this.#currentRoundNumber);
  }

  private isNewRound(snapshot: GameStateSnapshot): boolean {
    if (snapshot.winner !== null) {
      return false;
    }

    if (this.#lastWinner !== undefined && this.#lastWinner !== null && snapshot.winner === null) {
      return true;
    }

    return this.#lastTick !== null && snapshot.tick < this.#lastTick;
  }

  private async maybeJoinRound(snapshot: GameStateSnapshot, roundNumber: number): Promise<void> {
    if (this.#joinedRoundNumber === roundNumber || this.#joinInFlight) {
      return;
    }

    if (Date.now() < this.#nextJoinAttemptAt) {
      return;
    }

    this.#joinInFlight = true;
    const joinLane = this.pickJoinLane(snapshot);
    const payload = {
      heroClass: this.options.runtimeConfig.heroClass,
      heroLane: joinLane,
      ...(this.options.runtimeConfig.preferredGameId !== null
        ? { preferredGameId: this.options.runtimeConfig.preferredGameId }
        : {}),
      ...(this.options.runtimeConfig.skin !== null
        ? { skin: this.options.runtimeConfig.skin }
        : {}),
      ...(this.options.runtimeConfig.equippedItem !== null
        ? { equippedItem: this.options.runtimeConfig.equippedItem }
        : {}),
    };

    console.log(
      `[round] joining round=${roundNumber} lane=${joinLane} class=${payload.heroClass} skin=${payload.skin ?? "none"} item=${payload.equippedItem ?? "none"}`,
    );

    try {
      const result = await this.options.strategyApiClient.joinGame(payload);

      if (this.#currentRoundNumber !== roundNumber) {
        console.log(`[round] ignoring stale join response for round=${roundNumber}`);
        return;
      }

      if (!result.ok) {
        this.#nextJoinAttemptAt = Date.now() + JOIN_RETRY_DELAY_MS;
        console.error(
          `[round] join failed status=${result.status} retryInMs=${JOIN_RETRY_DELAY_MS} message=${result.message ?? "unknown"}`,
        );
        return;
      }

      this.#joinedRoundNumber = roundNumber;
      this.#nextJoinAttemptAt = 0;
      console.log(
        `[round] join accepted round=${roundNumber} gameId=${result.gameId ?? "unknown"} message=${result.message ?? "Deployment received."}`,
      );

      if (result.warning) {
        console.log(`[round] join warning: ${result.warning}`);
      }
    } catch (error: unknown) {
      this.#nextJoinAttemptAt = Date.now() + JOIN_RETRY_DELAY_MS;
      console.error(`[round] join request failed retryInMs=${JOIN_RETRY_DELAY_MS}`, error);
    } finally {
      this.#joinInFlight = false;
    }
  }

  private pickJoinLane(snapshot: GameStateSnapshot): Lane {
    const decision = this.options.decisionMaker.decide({
      botName: this.options.runtimeConfig.botName,
      snapshot: buildDecisionSnapshot(this.options.runtimeConfig.botName, snapshot),
    });

    return decision?.type === "switchLane" ? decision.lane : FALLBACK_JOIN_LANE;
  }
}
