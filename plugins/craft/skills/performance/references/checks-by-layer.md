# Checks by layer

Use only the layers the slow operation touches. Every check is a read. Each finding needs a pasted
line or a measurement, with its location.

## Critical path (always first)

- Calls awaited one after another that do not depend on each other. They can run together.
- A call to another service or a data store with no timeout. One slow dependency then stalls the
  whole operation.
- Blocking work inside a request: reading a file, parsing a large payload, heavy computation.
- A loop that makes one call per item (the N+1 pattern in application code).
- Start-up that waits on something unreachable. If the complaint is "it hangs on start", check
  that each dependency it connects to is reachable before anything else.

## Data access

- Find the queries the operation runs by reading its data layer, not by guessing.
- Confirm which environment and which data set you are connected to before running any plan.
- Ask the data store for the plan of each hot query, using its read-only explain feature. Look for:
  - a full scan where an index should apply,
  - far more rows examined than returned,
  - a single query that takes a large share of the total time.
- List the indexes that really exist and compare them with the ones the code expects. A declared
  index is not always a created index.
- Check the size of the tables or collections involved. A full scan is cheap on a small set and
  costly on a large one.
- A query inside a loop, or one fetch per item instead of one batched fetch.
- A missing index is reported with the query, the plan line and the suggested index. Creating it
  is a step for a human.

## Server

- Result sets with no limit. Many data libraries return everything by default.
- Whole records fetched when a few fields are needed. This inflates the query, the memory and the
  response.
- Connection pool size against realistic concurrency. Read the configured value, do not assume
  the default.
- Large responses: measure a realistic payload size rather than guessing.
- Repeated identical work inside one request (the same lookup made several times).

## Rendering on the server

- Data fetched in sequence that could be fetched together.
- A slow piece of data that blocks the whole page, when the page shell could be sent first and
  the slow part filled in after.
- Work done per request that does not depend on the request.
- If pages are fresh by design, keep them fresh. Recommend less work per request, not a cache.

## Client and assets

- Script size: run the project's production build and read the size report it prints, if it has
  one. Flag a route that ships far more script than its neighbours.
- A heavy library imported for one small use.
- Images: the largest image above the fold with no size hint, no modern format or no priority.
- Fonts that block the first paint.
- A service worker that intercepts every request without doing anything useful with it.
- Many small requests at load that could be one.
- Work on the main thread during interaction: long tasks, layout thrash, a list that renders
  every row.

## How to state the expected gain

Tie it to the baseline. If the operation takes 900 ms and one query takes 620 ms of that, the gain
from removing the query is at most 620 ms. Write it that way. If the share was not measured, write
"unknown until measured" and give the measurement to run.
