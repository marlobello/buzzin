# buzzin

A real-time trivia buzz-in web app. Mobile-first, no accounts required. A moderator creates a game, players join with a code, and the first to tap the buzzer wins the round.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | SvelteKit 2 + Svelte 5 (static adapter → Azure Static Web Apps) |
| API | Azure Functions v4, Node.js 22, TypeScript |
| Real-time | Azure SignalR Service (serverless mode) |
| State | Azure Table Storage |
| IaC | Bicep (`infra/`) |
| CI/CD | GitHub Actions |

---

## Installation

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- An Azure account with:
  - A **SignalR Service** instance (Free tier, serverless mode)
  - A **Storage Account**

### 1. Clone & install dependencies

```bash
git clone https://github.com/your-org/buzzin.git
cd buzzin
npm install
cd api && npm install && cd ..
```

### 2. Configure the API

Copy the example settings file and fill in your Azure connection strings:

```bash
cp api/local.settings.json.example api/local.settings.json
```

Edit `api/local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "<your-storage-connection-string>",
    "AzureSignalRConnectionString": "<your-signalr-connection-string>"
  }
}
```

> **Note:** Azurite works for Storage, but SignalR requires a real Azure instance (the Free tier is sufficient).

### 3. Run locally

Start the API and frontend in separate terminals:

```bash
# Terminal 1 — Azure Functions API (http://localhost:7071)
cd api && npm run start

# Terminal 2 — SvelteKit dev server (http://localhost:5173)
npm run dev
```

The SvelteKit dev server proxies `/api/*` requests to the Functions host automatically.

---

## Deploying to Azure

### First deploy (Bicep)

```bash
az deployment sub create \
  --location eastus \
  --template-file infra/main.bicep
```

After the deployment completes, copy the `swaDeploymentToken` output value and save it as the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret in your GitHub repository. Then add an `AZURE_CREDENTIALS` secret (a service principal JSON from `az ad sp create-for-rbac`).

Subsequent deploys run automatically via the GitHub Actions workflow on push to `main`.

---

## How to Play

### As a Moderator

1. Open the app and click **Create Game**.
2. Enter a game name — you'll land on the moderator dashboard.
3. Share the **4-letter join code** displayed on screen with your players.
4. Once players have joined, click **Start Game**.
5. Read a trivia question out loud. The first player to tap their buzzer appears at the top of the list.
6. If they answer correctly, click **+1** next to their name to award a point (players hear a coin sound and see confetti).
7. Click **Reset Buzzers** to clear buzz-ins and start the next question.
8. Repeat until you're done, then click **End Game**.

> Your moderator session is saved in your browser's `localStorage`. Refreshing the page keeps you in control.

### As a Player

1. Open the app on your phone or browser and click **Join Game**.
2. Enter the **4-letter join code** and your name.
3. Wait for the moderator to start the game — the big button will become active.
4. When a question is asked, **tap the button as fast as possible** to buzz in.
   - 🟢 **Green** — you were first!
   - 🟠 **Orange** — someone beat you.
5. If you're awarded a point, you'll hear a coin sound and see a confetti burst.
6. The moderator will reset buzzers between questions. Stay ready!

---

## Project Structure

```
src/routes/
  +page.svelte              # Landing: create or join game
  mod/[gameId]/             # Moderator dashboard
  play/[gameId]/            # Player buzzer view

src/lib/
  signalr.ts                # SignalR client connection
  sounds.ts                 # Web Audio API sound effects
  stores/game.svelte.ts     # Reactive game state store

api/src/
  storage.ts                # Azure Table Storage helpers
  signalr.ts                # SignalR broadcast helpers
  functions/                # One file per HTTP function

infra/
  main.bicep                # Root Bicep template
  modules/                  # SignalR, Storage, Static Web App modules
```
