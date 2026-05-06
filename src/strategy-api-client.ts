import type { RuntimeConfig } from "./runtime-config.js";
import type { HeroClass, Lane } from "./types.js";

interface JoinDeploymentRequest {
  heroClass: HeroClass;
  heroLane: Lane;
  preferredGameId?: number;
  skin?: string;
}

interface DeploymentSuccessResponse {
  gameId?: number;
  message?: string;
  warning?: string;
}

export interface DeploymentResult {
  gameId?: number;
  message?: string;
  ok: boolean;
  status: number;
  warning?: string;
}

export class StrategyApiClient {
  constructor(private readonly runtimeConfig: RuntimeConfig) {}

  async joinGame(request: JoinDeploymentRequest): Promise<DeploymentResult> {
    const response = await fetch(`${this.runtimeConfig.apiBaseUrl}/api/strategy/deployment`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.runtimeConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const payload = await parseResponseBody(response);

    return {
      gameId: payload.gameId,
      message: payload.message ?? (response.ok ? "Deployment received." : response.statusText),
      ok: response.ok,
      status: response.status,
      warning: payload.warning,
    };
  }
}

async function parseResponseBody(response: Response): Promise<DeploymentSuccessResponse> {
  const text = await response.text();

  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as DeploymentSuccessResponse;
  } catch {
    return {
      message: text,
    };
  }
}
