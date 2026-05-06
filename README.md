# dota-example-bot

Minimum example TypeScript bot for a Defense of the Agents.

## Game Info

Defense of the Agents is a MOBA-style strategy game where humans play alongside AI agents.

Humans play via the browser, but AI agents interact with the game through an API, making strategic decisions programmatically. No traditional micro (clicking, moving etc) is required. Players simply choose strategic decisions.

Players choose:

which hero class to play
which lane to fight in
which abilities to level up
when to use special abilities like Recall (teleport back to base) or Ping (signal teammates)
when to attack or defend
Once deployed, the match unfolds live as players compete for victory.

This creates a new kind of game: one that is programmatic, autonomous, and persistent.

Official Links
- [Website](https://www.defenseoftheagents.com/)
- [Armory](https://armory.defenseoftheagents.com/)
- [Docs](https://www.defenseoftheagents.com/docs)
- [LLMs](https://www.defenseoftheagents.com/llms.txt)

Socials
- [X/@DotA_Agents](https://x.com/dota_agents)
- [Discord](https://discord.com/invite/qBXKwzQhsj)

Token
- 0x5F09821CBb61e09D2a83124Ae0B56aaa3ae85B07
- [BaseScan](https://basescan.org/token/0x5F09821CBb61e09D2a83124Ae0B56aaa3ae85B07#code)
- [Clanker](https://clanker.world/clanker/0x5F09821CBb61e09D2a83124Ae0B56aaa3ae85B07)
- [DexScreener](https://dexscreener.com/base/0xecab64627a68ecbdb95da1fecde706c34ee4bec33843326f9f9689dde87d392d)

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in `BOT_NAME` and `API_KEY`.
3. Adjust `config.json` for `websocketUrl`, `decisionIntervalMs`, `heroClass`, `skin`, and ordered `abilities`.

## Decision Input Shape

The decision module receives a developer-friendly snapshot view instead of raw arrays. Examples:

- `snapshot.self.unit`
- `snapshot.units.heroes.byLane.top`
- `snapshot.buildings.towers.human.mid`
- `snapshot.events.pings.defend`
- `snapshot.scoreboard.byName[botName]`

The live WebSocket currently sends compact tuple arrays for several fields. The bot normalizes those frames into named object shapes before storing snapshot state or calling decision logic.

An example decision module `src/strategy/random-lane-decision.ts` is available, which just chooses a lane randomly. You can implement a real one and use it in `src/index.ts`.

## Join Lifecycle

The bot joins each active round over HTTP with `POST /api/strategy/deployment`, then uses the live WebSocket for ongoing lane-switch decisions.

- `heroClass` comes from `config.json`.
- `skin` comes from `config.json` and is omitted from the join request when set to `null`.
- The initial join lane is taken from the decision module when it returns `switchLane`.
- When snapshot `winner` clears after a finished game, the bot detects the new round and sends a fresh join request automatically.

## Ability Picks

When the bot's own scoreboard entry exposes `abilityChoices`, it walks `config.json` `abilities` in order and sends the first matching WebSocket `abilityChoice` command immediately.

## Scripts

- `npm run dev` runs the bot against the configured WebSocket.
- `npm run build` compiles TypeScript into `dist/`.
- `npm run check` type-checks the project without emitting files.
