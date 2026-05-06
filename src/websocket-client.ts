import WebSocket, { RawData } from "ws";
import { parseGameStateSnapshot } from "./game-state-codec.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { BotState } from "./state.js";
import type { BotCommand } from "./types.js";

const RECONNECT_DELAY_MS = 5_000;

export class GameWebSocketClient {
  #socket: WebSocket | null = null;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #closedByUser = false;

  constructor(
    private readonly runtimeConfig: RuntimeConfig,
    private readonly state: BotState,
  ) {}

  connect(): void {
    this.#closedByUser = false;
    this.#socket = new WebSocket(this.runtimeConfig.websocketUrl);

    this.#socket.on("open", () => {
      console.log("[ws] connected");
      this.sendRaw({
        type: "auth",
        token: this.runtimeConfig.apiKey,
      });
    });

    this.#socket.on("message", (data: RawData) => {
      const snapshot = parseGameStateSnapshot(data);

      if (!snapshot) {
        return;
      }

      this.state.setLastSnapshot(snapshot);
    });

    this.#socket.on("close", (code: number, reasonBuffer: Buffer) => {
      const reason = reasonBuffer.toString();
      console.log(`[ws] closed code=${code} reason=${reason || "none"}`);
      this.#socket = null;

      if (!this.#closedByUser) {
        this.scheduleReconnect();
      }
    });

    this.#socket.on("error", (error: Error) => {
      console.error("[ws] error", error);
    });
  }

  close(): void {
    this.#closedByUser = true;

    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    this.#socket?.close();
    this.#socket = null;
  }

  sendCommand(command: BotCommand): boolean {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      console.log("[ws] command skipped because socket is not open");
      return false;
    }

    this.sendRaw(command);
    return true;
  }

  private scheduleReconnect(): void {
    if (this.#reconnectTimer) {
      return;
    }

    console.log(`[ws] reconnecting in ${RECONNECT_DELAY_MS}ms`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private sendRaw(payload: object): void {
    this.#socket?.send(JSON.stringify(payload));
  }
}
