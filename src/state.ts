import type { GameStateSnapshot } from "./types.js";

type SnapshotListener = (snapshot: GameStateSnapshot) => void;

export class BotState {
  #lastSnapshot: GameStateSnapshot | null = null;
  #listeners = new Set<SnapshotListener>();

  setLastSnapshot(snapshot: GameStateSnapshot): void {
    this.#lastSnapshot = snapshot;

    for (const listener of this.#listeners) {
      listener(snapshot);
    }
  }

  getLastSnapshot(): GameStateSnapshot | null {
    return this.#lastSnapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
