# Decisions

## Assumptions

1. **One doctor's day is enough.** I modeled one doctor and 20 half-hour slots on one day. That keeps the project focused on the required collision problem rather than expanding into scheduling across doctors and dates.
2. **Receptionists are trusted.** I did not add login or roles because authentication is out of scope. A desk label identifies a browser tab for display; it is not a security identity.
3. **A 90-second hold is an acceptable interruption window.** I chose hold-on-click so two receptionists cannot both start the same booking. An abandoned slot can remain held for up to 90 seconds; the server clock determines expiry, and a sweeper only clears slots still marked held.
4. **A slot is the unit of concurrency.** Each decision changes one slot document, and the clinic has three or four desks. MongoDB's conditional atomic update and one-second polling are enough for this scale; cross-document transactions and a separate lock service are not needed.

## What I chose and why

I used React with Vite, Node and Express, MongoDB's official Node driver, and Docker Compose. MongoDB's conditional update is the arbiter: a hold succeeds only if the slot is free or its previous hold has expired. The condition and state change happen together on one document, so two requests cannot both claim that slot. A standalone MongoDB is sufficient; no replica set is needed for these single-document updates.

The one-time setup cost was installing Docker Desktop and downloading/building the service images. Compose then brings up MongoDB, the API, and the React board with one command. The board polls once a second, which is simple to run and meets the expected update time for a few desks.

## What I considered and rejected

- **Read, check, then write in application code:** two requests can both read "free" before either writes. The deliberately unsafe demo route demonstrates this failure.
- **Redis/Redlock:** it would add another state system and lock-expiry failure modes when MongoDB can settle the race directly.
- **MongoDB transactions:** they coordinate multiple documents, but a slot transition changes one document.
- **A unique-index workaround:** it would require extra claim records and cleanup; the conditional update directly expresses the state change.
- **Websockets:** they add connection management when one-second polling is adequate here.
- **Lock-on-confirm:** two desks could both start the booking and one would lose at the final step. Hold-on-click avoids that surprise but can temporarily strand a slot when someone is interrupted.

## What I would do next

At ten times the traffic, I would measure the polling load and the capacity and availability of a single MongoDB node first. Popular slots can also become contention hotspots. If measurements required it, I would improve database availability and consider change streams with SSE. Supporting multiple doctors would require revisiting query patterns and the shard key. I would also add browser-level end-to-end tests and operational metrics.

## Bugs found while building / AI mistakes caught

The first AI-generated confirm-race check sent competing attempts one after another. That looked like a race test but did not create overlapping requests. Reviewing it against the requirement showed the gap, so the check was changed to send both attempts concurrently with `Promise.all`. The final race script passed with two and four contenders; the intentionally unsafe route showed multiple winners.

## Time and personal note

I estimate I spent 10-20 hours on the project, including setup, implementation, testing, and preparing the submission. My main takeaway is that the race needs to be tested directly: a single-user click-through would not reveal the read-then-write failure. The conditional update keeps the correctness rule small and close to the slot data.
