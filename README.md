# Seat-Hold Board

A shared clinic appointment board. MongoDB conditionally changes each slot in one atomic document update, so competing desks cannot both acquire the same hold.

## Run it

Prerequisite: Docker Engine with the Compose plugin. Copy `.env.example` to `.env` if you want to change settings. Start the full system with:

```sh
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The API runs privately on port 3000. The first server start seeds 20 slots for Dr. Sharma on November 5, 2026, from 08:00 to 19:00 in half-hour steps, skipping noon to 13:00. Seed is idempotent and does not overwrite existing bookings.

## Race demonstration

With the board running, run the default 300-round/two-contender race:

```sh
docker compose run --rm race
```

Set `CONTENDERS=4` or `ROUNDS=1000` in `.env` to change the run. To show the read-then-write race bug, set `ENABLE_NAIVE=true` and `NAIVE=true`, rebuild/restart (`docker compose up --build -d server`), and run the race service. It should report multiple winners and FAIL. Restore both values to false to use the safe route. The naive route is hidden unless explicitly enabled.

Locally, with MongoDB running on localhost and the server started in another terminal (`npm install && npm start`), use `npm run race`. `API_URL`, `MONGO_URL`, `ROUNDS`, and `CONTENDERS` can be set in the environment.

## Tests and data

Run the integration test with MongoDB available at `MONGO_URL` (defaults to `mongodb://localhost:27017/seatboard_test`):

```sh
npm test
```

Reset every seeded slot to free for a demo:

```sh
npm run reset
```

Seed without changing existing documents:

```sh
npm run seed
```

## Show two desks

Open the board in two browser tabs. Each tab gets a separate session storage desk label. Click the same free time in both tabs; one holds it and the other sees the conflict. The board polls once a second. Confirm with a patient name or release the hold. Closing a tab strands its hold until it expires (90 seconds by default).
