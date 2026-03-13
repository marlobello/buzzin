# Copilot Instructions

## Project

**buzzin** is a real-time trivia buzz-in web app. Mobile-first, no auth, no long-term storage. Players join a game via a code, then tap a large buzzer button. The moderator sees who buzzed first.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | SvelteKit 2 + Svelte 5 (static adapter → Azure Static Web Apps) |
| API | Azure Functions v4, Node.js 22, TypeScript (CJS) |
| Real-time | Azure SignalR Service (serverless mode, `@azure/signalr-management` SDK) |
| State | Azure Table Storage — ephemeral game/participant data (no TTL needed) |
| IaC | Bicep (`infra/main.bicep` + `infra/modules/`) |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) |

## Commands

```bash
# Frontend dev server (http://localhost:5173)
npm run dev

# Type-check frontend
npm run check

# Build frontend (output → build/)
npm run build

# API local dev (requires local.settings.json, Azure Functions Core Tools)
cd api && npm run start

# Build API TypeScript
cd api && npm run build
```

## Project Structure

```
src/routes/
  +page.svelte            # Landing: create or join game
  mod/[gameId]/           # Moderator dashboard (participant list, buzz order, controls)
  play/[gameId]/          # Participant view (the big buzzer button)

src/lib/
  signalr.ts              # @microsoft/signalr client — connectToGame(), disconnect()
  stores/game.ts          # Svelte writable store: GameState, Participant, derived buzzOrder

api/src/
  storage.ts              # Azure Table Storage helpers (Games, Participants, GameLookup tables)
  signalr.ts              # @azure/signalr-management helpers: getClientAccessUrl, broadcastToGame
  functions/              # One file per HTTP function (negotiate, gamesCreate, gamesJoin, etc.)

infra/
  main.bicep              # Root template: wires SignalR + Storage + Static Web App modules
  modules/signalr.bicep   # Azure SignalR Service (Free_F1, serverless mode)
  modules/storage.bicep   # Azure Storage Account (Standard_LRS)
  modules/static-web-app.bicep  # Azure Static Web Apps (Free tier) + app settings injection
```

## API Routes

All routes are prefixed `/api/` by the Static Web Apps router.

| Method | Route | Description |
|---|---|---|
| GET/POST | `/api/negotiate?gameId=&userId=` | Returns SignalR `{ url, accessToken }` |
| POST | `/api/games` | Create game → returns `{ gameId, joinCode, moderatorId }` |
| POST | `/api/games/join` | Join game → returns `{ gameId, participantId }` |
| GET | `/api/games/{gameId}` | Get full game state (used on page load) |
| POST | `/api/games/{gameId}/start` | Moderator starts game, broadcasts `game-started` |
| POST | `/api/games/{gameId}/buzz` | Participant buzzes, broadcasts `buzzed-in` |
| POST | `/api/games/{gameId}/reset` | Moderator resets all buzzers, broadcasts `buzzers-reset` |
| POST | `/api/games/{gameId}/point` | Moderator awards point, broadcasts `scores-updated` |

## SignalR Message Types

All messages are broadcast to the SignalR group `game-{gameId}`.

- `participant-joined` → `Participant` object
- `game-started` → (no args)
- `buzzed-in` → `{ participantId, name, buzzOrder }`
- `buzzers-reset` → (no args)
- `scores-updated` → `Array<{ participantId, name, score }>`

## Key Conventions

- **Moderator auth**: `moderatorId` is a random token returned on game creation and stored in `localStorage`. It is sent with mutating moderator requests. No formal auth — security by obscurity is acceptable here.
- **Participant identity**: `participantId` stored in `localStorage` keyed by `participant-{gameId}`.
- **Table Storage schema**: Games → `PartitionKey='GAME'`, `RowKey=gameId`. Participants → `PartitionKey=gameId`, `RowKey=participantId`. GameLookup → `PartitionKey='LOOKUP'`, `RowKey=joinCode` (for join-code → gameId resolution).
- **Svelte 5 runes**: Use `$state()`, `$derived()`, `$props()` — not `writable()` stores in components. Stores are only in `src/lib/stores/`.
- **API TypeScript**: CJS output (`"module": "commonjs"` in `api/tsconfig.json`). No ESM in `api/`.
- **Bicep outputs**: `swaDeploymentToken` is a `@secure()` output. After first deploy, store it as `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub repo secrets for subsequent deploys.
- **Join code format**: 4 uppercase letters, excluding `I` and `O` to avoid confusion with `1` and `0`.

## Local Dev Setup

1. Copy `api/local.settings.json.example` to `api/local.settings.json` and fill in real Azure connection strings (Azurite works for Storage but not for SignalR — a real free-tier SignalR instance is needed).
2. Install [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local).
3. Run `npm run dev` (frontend) and `cd api && npm start` (API) in separate terminals.
4. SvelteKit dev server proxies `/api/*` to the Functions host on port 7071 — configure in `vite.config.ts` if needed.

## GitHub Secrets Required

| Secret | How to get it |
|---|---|
| `AZURE_CREDENTIALS` | `az ad sp create-for-rbac --role Contributor --scopes /subscriptions/{id}` → JSON output |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | From first Bicep deployment output `swaDeploymentToken` |

