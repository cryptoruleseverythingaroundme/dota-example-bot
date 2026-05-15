import type { BotCommand, Faction, Lane } from "../types.js";
import type { DecisionInput, DecisionMaker } from "./decision-loop.js";

const LANES: Lane[] = ["top", "mid", "bot"];
const BASE_THREAT_RECALL_DISTANCE_PX = 400;

export class RandomLaneDecisionMaker implements DecisionMaker {
  decide(input: DecisionInput): BotCommand | null {
    if (shouldRecallForBaseDefense(input)) {
      return {
        type: "recall",
      };
    }

    // if (isSprintReady(input)) {
    //   return {
    //     type: "sprint",
    //   };
    // }

    // if (isStrollReady(input)) {
    //   return {
    //     type: "stroll",
    //   };
    // }

    const lane = LANES[Math.floor(Math.random() * LANES.length)];
    const targetLane: Lane = "bot";

    if (
      input.snapshot.self.scoreboard?.lane === targetLane ||
      input.snapshot.self.unit?.lane === targetLane
    ) {
      return null;
    }

    return {
      type: "switchLane",
      lane: targetLane,
    };
  }
}

function isSprintReady(input: DecisionInput): boolean {
  const selfScoreboard = input.snapshot.self.scoreboard;

  if (!selfScoreboard) {
    return false;
  }

  return (selfScoreboard.sprintRemainingMs ?? 0) <= 0 &&
    (selfScoreboard.sprintCooldownMs ?? Number.POSITIVE_INFINITY) <= 0;
}

function isStrollReady(input: DecisionInput): boolean {
  const selfScoreboard = input.snapshot.self.scoreboard;

  if (!selfScoreboard) {
    return false;
  }

  return (selfScoreboard.strollRemainingMs ?? 0) <= 0 &&
    (selfScoreboard.strollCooldownMs ?? Number.POSITIVE_INFINITY) <= 0;
}

function shouldRecallForBaseDefense(input: DecisionInput): boolean {
  const selfScoreboard = input.snapshot.self.scoreboard;
  const selfFaction = input.snapshot.self.faction;

  if (!selfScoreboard || !selfFaction || !selfScoreboard.alive) {
    return false;
  }

  if (input.snapshot.self.unit?.recallShielded) {
    return false;
  }

  if ((selfScoreboard.recallCooldownMs ?? 0) > 0) {
    return false;
  }

  const allyBase = input.snapshot.buildings.bases[selfFaction];

  if (!allyBase) {
    return false;
  }

  const enemyFaction = oppositeFaction(selfFaction);

  return input.snapshot.units.heroes.byFaction[enemyFaction].some((hero) => {
    const dx = hero.x - allyBase.x;
    const dy = hero.y - allyBase.y;
    return dx * dx + dy * dy <= BASE_THREAT_RECALL_DISTANCE_PX * BASE_THREAT_RECALL_DISTANCE_PX;
  });
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "human" ? "orc" : "human";
}
