/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Queue consumer: a Worker that can consume from a
 * Queue: https://developers.cloudflare.com/queues/get-started/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const cache = caches.default;
        const cacheKey = new Request(request.url);

        // Try cache first
        let response = await cache.match(cacheKey);
        if (response) {
            return response;
        }

        const stops = [
            // Bus stops
            { id: 54036, name: "19th Ave S & Washington Ave SE" },
            { id: 54033, name: "19th Ave S & 2nd St S" },
            { id: 16325, name: "Cedar Ave S & Washington Ave (15th Ave)" },
            { id: 57023, name: "Washington Ave S & 15th Ave S" },

            // West Bank (Green Line)
            { id: 56046, name: "West Bank Station (EB)" },
            { id: 56047, name: "West Bank Station (WB)" },

            // Cedar-Riverside (Blue Line)
            { id: 56022, name: "Cedar-Riverside Station (NB)" },
            { id: 56023, name: "Cedar-Riverside Station (SB)" }
        ];

        const fetchStop = async (stop: { id: number; name: string }) => {
            try {
                const url = `https://svc.metrotransit.org/NexTrip/${stop.id}?format=json`;

                const res = await fetch(url);
                const data = await res.json();

                const departures = data.map((d: any) => ({
                    route: d.Route,
                    destination: d.Destination,
                    direction: d.Direction,
                    departure_text: d.DepartureText,
                    departure_time: new Date(
                        parseInt(d.DepartureTime.replace(/[^0-9]/g, ""))
                    ).toISOString(),
                    vehicle: d.VehicleLabel
                }));

                return {
                    stop_id: stop.id,
                    name: stop.name,
                    departures
                };

            } catch (e) {
                return {
                    stop_id: stop.id,
                    name: stop.name,
                    error: e.toString()
                };
            }
        };

        const results = await Promise.all(stops.map(fetchStop));

        const body = JSON.stringify({
            timestamp: new Date().toISOString(),
            stops: results
        }, null, 2);

        response = new Response(body, {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=300",
                "Access-Control-Allow-Origin": "*"
            }
        });

        // Store in cache (5 min)
        ctx.waitUntil(cache.put(cacheKey, response.clone()));

        return response;
    },
    // The queue handler is invoked when a batch of messages is ready to be delivered
    // https://developers.cloudflare.com/queues/platform/javascript-apis/#messagebatch
    async queue(batch, env): Promise<void> {
        // A queue consumer can make requests to other endpoints on the Internet,
        // write to R2 object storage, query a D1 Database, and much more.
        for (let message of batch.messages) {
            // Process each message (we'll just log these)
            console.log(`message ${message.id} processed: ${JSON.stringify(message.body)}`);
        }