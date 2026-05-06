import { BotState } from "../state.js";
import type { BotCommand } from "../types.js";
import { GameWebSocketClient } from "../websocket-client.js";
import { buildDecisionSnapshot, type DecisionSnapshot } from "./decision-snapshot.js";

export interface DecisionMaker {
  decide(input: DecisionInput): BotCommand | null;
}

export interface DecisionInput {
  botName: string;
  snapshot: DecisionSnapshot;
}

interface DecisionLoopOptions {
  botName: string;
  decisionIntervalMs: number;
  decisionMaker: DecisionMaker;
  state: BotState;
  websocketClient: GameWebSocketClient;
}

export class DecisionLoop {
  #timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: DecisionLoopOptions) {}

  start(): void {
    if (this.#timer) {
      return;
    }

    const runDecision = (): void => {
      const snapshot = this.options.state.getLastSnapshot();

      if (!snapshot) {
        console.log("[decision] skipped because no snapshot has been received yet");
        return;
      }

      const command = this.options.decisionMaker.decide({
        botName: this.options.botName,
        snapshot: buildDecisionSnapshot(this.options.botName, snapshot),
      });

      if (!command) {
        console.log(`[decision] tick=${snapshot.tick} no action`);
        return;
      }

      const wasSent = this.options.websocketClient.sendCommand(command);

      if (wasSent) {
        console.log(`[decision] tick=${snapshot.tick} sent ${JSON.stringify(command)}`);
      }
    };

    runDecision();
    this.#timer = setInterval(runDecision, this.options.decisionIntervalMs);
  }

  stop(): void {
    if (!this.#timer) {
      return;
    }

    clearInterval(this.#timer);
    this.#timer = null;
  }
}
