# Seat-Hold Board

A shared appointment board for a clinic front desk. Several desks can view and update the same slots. MongoDB settles competing holds with a conditional, atomic update to the slot document.

## Start the whole system

### Prerequisite

Install Docker Desktop (or Docker Engine with the Docker Compose plugin) and start it. On macOS, open Docker Desktop and wait for **Engine running**. Node.js, npm, and a separate MongoDB installation are not needed for the Docker setup.

From this project folder, run one command:

```sh
docker compose up --build
```

The first run downloads the MongoDB, Node, and nginx base images and builds the API and web app images. It may take a few minutes. Compose waits for MongoDB’s health check before starting the API. The API seeds the slots automatically when it starts. Keep this Terminal window open while using the board.

Open **http://localhost:8080** in a browser. Compose keeps the API and MongoDB on its private network; you do not need to enter a MongoDB URI or create a `.env` file.

To stop the system, press **Control+C** in the Terminal running Compose. `docker compose down` also stops the services and keeps the appointment data in the named MongoDB volume. To start again, use `docker compose up`. The `mongo-data` volume preserves bookings across restarts.

If port 8080 is already in use, stop the other service using it, or change the left side of `8080:80` under `client.ports` in `docker-compose.yml` and use that port in your browser.

## What Compose starts

| Service | Purpose |
| --- | --- |
| `mongo` | Standalone MongoDB with a health check and persistent named volume |
| `server` | Express REST API; seeds slots at startup and sweeps expired holds every five seconds |
| `client` | Vite-built React board served by nginx on host port 8080; nginx proxies `/api` to Express |
| `race` | On-demand tool service for the concurrency script; it is not started by `docker compose up` |

A standalone MongoDB is sufficient because each hold, confirmation, or release changes one slot document. No replica set, transaction, Redis, login, or websocket service is used.

## Board and slot behavior

The seed creates 20 half-hour slots for Dr. Sharma on November 5, 2026, from 08:00 to 19:00, skipping 12:00–13:00. Seeding is idempotent and does not overwrite existing slot documents or bookings.

Click **Hold slot** to hold a free slot for 90 seconds. Enter a patient name and confirm, or release the hold. A held slot shows its desk label and countdown. Each browser tab has its own desk label. The board polls the API every second, shows an optimistic hold immediately, and rolls it back with a message if the server rejects it. The server clock controls expiry; the browser clock is only used to display the countdown.

## Run the race test

Leave the app running in one Terminal. Open a second Terminal in the project folder and run:

```sh
docker compose run --rm race
```

The default is 300 rounds with two simultaneous hold contenders. A successful run ends with output like:

```text
Rounds: 300; contenders: 2
Winners per round distribution: {"1":300}
Invariant violations: 0
PASS
```

To test four contenders or change the number of rounds:

```sh
CONTENDERS=4 docker compose run --rm race
ROUNDS=1000 docker compose run --rm race
```

The script resets the test slot between rounds, fires all hold requests concurrently, races valid and invalid confirmations, then checks MongoDB invariants. It exits non-zero and prints `FAIL` if it finds a violation. The last round leaves its test slot booked; reset the demo data after the run if you want every slot free again.

### Optional: demonstrate the unsafe read-then-write example

The project includes an intentionally unsafe endpoint to show why checking a slot in application code and writing later can double-book a hold. It is disabled by default. To enable it, copy `.env.example` to `.env`, set both `ENABLE_NAIVE=true` and `NAIVE=true`, then recreate the API:

```sh
docker compose up -d --build server
NAIVE=true docker compose run --rm race
```

The naive run is expected to print multiple winners and `FAIL`; that is the bug demonstration. Restore both settings to `false` (or remove `.env`) and recreate the API before normal use:

```sh
docker compose up -d --build server
```

Do not enable the naive endpoint in a real deployment.

## Test expiry and booked-slot safety

With the Compose app running, run the integration test against a separate test database so demo bookings are not changed:

```sh
docker compose run --rm \
  -e MONGO_URL=mongodb://mongo:27017/seatboard_test \
  --entrypoint node race --test server/slots.test.js
```

The test proves an expired hold can be claimed by another desk and that hold, release, and the held-only sweeper filter cannot change a booked slot.

## Reset or reseed the board

Reset every seeded slot to free:

```sh
docker compose run --rm --entrypoint node race scripts/reset.js
```

Seed slots without changing existing documents:

```sh
docker compose run --rm --entrypoint node race scripts/seed.js
```

Both commands use the MongoDB connection provided to the Compose service. They do not require a manually supplied URI.

## Demo two desks

1. Start Compose and open **http://localhost:8080** in two browser tabs.
2. Check that the tabs show different desk labels.
3. Hold a free slot in one tab. The other tab should show it as held within about one second.
4. Try to hold that slot from the other tab. It should be rejected and the UI should show the server’s state.
5. Confirm with a patient name or release the hold.
6. For a repeatable simultaneous race, use `docker compose run --rm race` in a second Terminal as described above.

## Configuration

No `.env` file is required. To customize settings, copy `.env.example` to `.env` and edit it before starting Compose:

- `HOLD_TTL_SECONDS` — hold duration in seconds (default `90`)
- `ROUNDS` — race test rounds (default `300`)
- `CONTENDERS` — simultaneous hold requests per round (default `2`)
- `ENABLE_NAIVE` — expose the deliberately unsafe demo endpoint (default `false`)
- `NAIVE` — direct the race script to that endpoint (default `false`)

## Troubleshooting

- **Cannot connect to Docker:** Open Docker Desktop and wait for **Engine running**, then retry the Compose command.
- **Board does not open:** Check `docker compose ps`; wait until `mongo` is healthy and `client`, `server`, and `mongo` are running. Review logs with `docker compose logs server client`.
- **Port 8080 is busy:** Change the host port in `client.ports` as described above.
- **Want to see all service logs:** Run `docker compose logs -f` from the project folder.
