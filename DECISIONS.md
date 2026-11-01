# Decisions

## What I chose

MongoDB's conditional update is the arbiter. A hold succeeds only when the slot is free or its previous hold has expired, all in the filter of one single-document update. MongoDB serializes competing writes to that document, so the losing desk sees a conflict. This keeps the correctness rule beside the data and avoids a separate locking service. The official Node driver keeps the data path small and visible.

The setup has three runtime pieces: a standalone MongoDB, a small Express API, and a static React board served by nginx. Docker Compose starts them together. No replica set is needed: every decision touches one slot document, so multi-document transactions and replica-set setup add no value here.

## Alternatives considered

- Read, check, then write in application code can let two requests read “free” before either writes. The deliberately unsafe demo endpoint exposes this failure.
- Redis/Redlock adds a second state system, lock expiry and failure modes; the slot document already supports the needed atomic condition.
- MongoDB transactions coordinate multiple documents, while this decision changes one document.
- A unique-index trick would need extra lock/claim records and cleanup. A conditional update directly expresses the slot state transition.
- Websockets add connection management. One-second polling is adequate for three or four desks and easier to operate.
- Lock-on-confirm lets two desks start the same booking and creates a late loser. Hold-on-click settles contention before patient entry.

## Hold-on-click tradeoff and assumptions

A free-slot click starts a 90-second hold. This prevents two desks from beginning the same booking and avoids a confirm-time surprise. The cost is that an interrupted receptionist can strand a slot until the hold expires, at most 90 seconds. `HOLD_TTL_SECONDS` controls the duration. Trusted users share one doctor/day board; the server clock is the only expiry clock. The server validates tokens, but this is not an authentication system.

## Growth and next steps

At ten times the traffic, a single MongoDB node may become a throughput or availability limit. One-second polling multiplies reads by every open tab; I would move updates to MongoDB change streams exposed through SSE. A hot slot can still attract serialized contention. Multiple doctors would require a doctor-aware query and likely a shard key chosen around the workload. I would next add operational metrics, request limits, and a deployment topology appropriate to the required availability.

## Bugs found while building / AI mistakes caught

TODO: Add the bugs found during your own review and any AI mistakes you caught.

## Personal notes

TODO: Add your hours spent.

TODO: Add your own thoughts about the project and tradeoffs.
