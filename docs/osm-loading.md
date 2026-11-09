# OSM loading in Atlas

The main map and Access Gaps share `lib/osm/overpassClient.cjs`. This keeps their provider settings, application identification, raw-response cache, duplicate-request suppression and provider cooldowns consistent.

## Changes based on Overpass documentation

- Overpass may queue a request for 15 seconds before executing it. A 20-second query allowance therefore needs a longer HTTP deadline. Atlas allows query time plus 20 seconds for queueing/body transfer, with a 50-second budget per shared transport call including provider fallback. Browser requests allow at least 60 seconds.
- Rate-limited or busy providers are cooled down for at least 30 seconds, or longer when Retry-After requires it. The main map retries transient failures up to twice with backoff and visible status; permanent request errors are not retried.
- Browser retries carry a bounded attempt number to both APIs. The next attempt starts with the alternate provider even if it reaches a fresh server process. This prevents a slow primary from repeatedly exhausting the request budget before fallback can start. Provider order does not change cache identity or the selected area.
- Identical in-flight queries share one request per server process. Successful raw responses and display results are cached. Failed queries and responses with Overpass runtime-error remarks are never recorded as successful empty data.
- Display-cache keys include exact geometry and output options. Complete cached display data can be used for up to seven freshness periods after a provider failure, with a stale-data warning. A normal expired-cache read no longer destroys that fallback. Routing uses fresh, complete data.
- Multiple infrastructure categories are requested separately, including refreshes. A failed category leaves previously loaded assets available; failed requests are shown explicitly.

## Redis failures

The OSM cache and API rate limiter share `lib/redisFallback.cjs`. Connection plus command execution has a 500 ms deadline. A failure closes the connection and bypasses Redis for 60 seconds in that process, then permits a new connection attempt. Offline command queueing and automatic reconnect retries are disabled, preventing each GET, SET, or rate-limit check from waiting through another reconnect cycle. Logs report the fallback once per failed connection attempt without exposing credentials.

OSM reads check memory first. Writes always retain a local copy before attempting Redis persistence, and Redis hits populate memory without resetting the original data timestamp. Thus a failing Redis write cannot discard a completed download. Local cache capacity remains bounded at 50 entries, and the existing per-process rate limiter remains active during outages. Cross-process caching and shared quotas require a working Redis connection.

This makes a Redis outage tolerable; it does not repair the configured Redis service. Check the provider's database status, endpoint/port, credentials, network access and TLS requirements when the connection remains unavailable. The `Polygon has 5 vertices` log is query-construction information, not a failure.

Access Gaps uses the same query construction and transport with separate major-road, local-road, path and health-facility groups. Geometry and OSM node IDs are retained for routing. Queries ask for one result beyond the group's limit, allowing Atlas to detect truncation and subdivide instead of treating a cut-off network as complete. Recovery divides the actual buffered query rectangle, preserving its full extent without repeatedly adding another buffer. Selected admin boundaries and population counts remain unchanged.

The main map's simplified, trimmed road display is not used as a complete routing graph. Shared raw-query caching can reuse identical requests; a different extent or road-group request still needs its own extraction.

## Hosting

Public defaults are `https://overpass-api.de/api/interpreter` and `https://overpass.private.coffee/api/interpreter` (the current name of the former Kumi instance). Both can be overloaded.

Set the server-side `OVERPASS_API_URL` to an operator-provided interpreter URL to use a dedicated or self-hosted service. This overrides public defaults for both loaders. Keep credential-bearing URLs in server environment configuration. This change does not provision or subscribe to a service.

The request coalescing and provider cooldown state are per process. Redis, when configured, supplies shared data caching; it does not turn local cooldowns into a deployment-wide queue. Public infrastructure cannot provide a guaranteed service level for an operational platform.

Sources:

- [Overpass manual: resource limits, queueing, and quotas](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [Overpass manual: bounding boxes and complete geometry](https://dev.overpass-api.de/overpass-doc/en/full_data/bbox.html)
- [OpenStreetMap: current public Overpass instances](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances)
- [ioredis: reconnection and offline queue behavior](https://github.com/redis/ioredis#auto-reconnect)

## Reusable extracts and scheduled refresh

Successful raw OSM query responses are now saved atomically to a private extract directory, preserving full geometry, node IDs, query identity, source timestamp and ODbL attribution. Subsequent server processes can reuse them without Redis or Overpass. The normal freshness limit is 24 hours; failed refreshes do not replace prior files. Runtime-error responses are rejected, and result-limit checks still apply before any extract is accepted as a complete routing network. Query-limited responses can trigger smaller extraction sections as before.

Local development uses `.atlas-data/osm` (excluded from version control). Set `OSM_EXTRACT_DIR` to a private persistent directory shared by Atlas and its refresh worker when deploying. Vercel does not enable this disk store by default because its filesystem is ephemeral; a persistent-volume worker/server or a separately provisioned shared storage service is required for durable production extracts. This change does not provision a cloud storage service.

- `npm run osm:refresh` refreshes previously requested extracts older than 18 hours.
- `npm run osm:refresh:watch` repeats that check every six hours. Run one worker against the same directory as the app, supervised by your hosting platform, or schedule the one-shot command with cron.
- Refresh queries are sequential. A provider failure stops that cycle, retains old files, and lets the next cycle retry. No new regions or private user plans are downloaded by this job.
- The store limits individual records to 12 MiB and retains at most 128 records / 512 MiB, removing oldest records and records older than 30 days when writing. Browser caching still retains completed area inputs for retry.

Earth Engine access estimates are available as the default option in Access Gaps. They use the MAP 2019 travel surface and the Healthsites community snapshot, so that mode does not call Overpass for roads or facilities. Its method and limitations are described in the [Access Gaps README](../components/apps/access-gaps/README.md).
