import type { BotCommand, Lane } from "../types.js";
import type { DecisionInput, DecisionMaker } from "./decision-loop.js";

const LANES: Lane[] = ["top", "mid", "bot"];

export class RandomLaneDecisionMaker implements DecisionMaker {
  decide(_input: DecisionInput): BotCommand {
    const lane = LANES[Math.floor(Math.random() * LANES.length)];
    return {
      type: "switchLane",
      lane,
    };
  }
}
