import { AbilityPicker } from "./ability-picker.js";
import { loadRuntimeConfig } from "./runtime-config.js";
import { RoundJoiner } from "./round-joiner.js";
import { BotState } from "./state.js";
import { RandomLaneDecisionMaker } from "./strategy/random-lane-decision.js";
import { DecisionLoop } from "./strategy/decision-loop.js";
import { StrategyApiClient } from "./strategy-api-client.js";
import { GameWebSocketClient } from "./websocket-client.js";

async function main(): Promise<void> {
  const runtimeConfig = await loadRuntimeConfig();
  const state = new BotState();
  const decisionMaker = new RandomLaneDecisionMaker();
  const strategyApiClient = new StrategyApiClient(runtimeConfig);
  const websocketClient = new GameWebSocketClient(runtimeConfig, state);
  const abilityPicker = new AbilityPicker({
    runtimeConfig,
    state,
    websocketClient,
  });
  const roundJoiner = new RoundJoiner({
    decisionMaker,
    runtimeConfig,
    state,
    strategyApiClient,
  });
  const decisionLoop = new DecisionLoop({
    botName: runtimeConfig.botName,
    decisionIntervalMs: runtimeConfig.decisionIntervalMs,
    decisionMaker,
    state,
    websocketClient,
  });

  console.log(
    `[startup] bot=${runtimeConfig.botName} ws=${runtimeConfig.websocketUrl} api=${runtimeConfig.apiBaseUrl} intervalMs=${runtimeConfig.decisionIntervalMs}`,
  );

  websocketClient.connect();
  abilityPicker.start();
  roundJoiner.start();
  decisionLoop.start();

  const shutdown = (): void => {
    console.log("[shutdown] stopping bot");
    decisionLoop.stop();
    abilityPicker.stop();
    roundJoiner.stop();
    websocketClient.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error("[startup] failed to launch bot", error);
  process.exitCode = 1;
});
