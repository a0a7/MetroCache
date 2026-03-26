/**
 * Metro Transit API Caching Worker
 * Fetches real-time transit data and caches responses for 5 minutes
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const cache = caches.default;
		
		// Check if raw data endpoint is requested
		const showRaw = url.pathname === '/raw';
		
		// Create cache key (use base URL without query params for consistent caching)
		const cacheKey = new Request(url.origin + url.pathname);

		// Try cache first (unless ?nocache is present)
		const bypassCache = url.searchParams.has('nocache');
		let response = await cache.match(cacheKey);
		if (response && !bypassCache) {
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
				if (!res.ok) {
					throw new Error(`API returned ${res.status}: ${res.statusText}`);
				}
				
				const data = await res.json() as any;

				// Extract departures array from response
				const departuresArray = data.departures || [];

				const departures = departuresArray.map((d: any) => ({
					route: d.route_short_name,
					destination: d.description,
					direction: d.direction_text,
					departure_text: d.departure_text,
					departure_time: d.departure_time,
					actual: d.actual,
					trip_id: d.trip_id
				}));

				return {
					stop_id: stop.id,
					name: stop.name,
					departures,
					raw_data: data // Include raw response for debugging
				};

			} catch (e) {
				return {
					stop_id: stop.id,
					name: stop.name,
					error: String(e),
					message: e instanceof Error ? e.message : 'Unknown error'
				};
			}
		};

		const results = await Promise.all(stops.map(fetchStop));

		let body: string;
		if (showRaw) {
			// Raw endpoint - show full API responses
			body = JSON.stringify({
				timestamp: new Date().toISOString(),
				stops: results.map(r => ({
					stop_id: r.stop_id,
					name: r.name,
					raw_data: r.raw_data,
					error: r.error,
					message: r.message
				}))
			}, null, 2);
		} else {
			// Normal endpoint - show formatted data
			body = JSON.stringify({
				timestamp: new Date().toISOString(),
				stops: results.map(r => ({
					stop_id: r.stop_id,
					name: r.name,
					departures: r.departures,
					error: r.error,
					message: r.message
				}))
			}, null, 2);
		}

		response = new Response(body, {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=300",
				"Access-Control-Allow-Origin": "*",
				"X-Cache-Status": bypassCache ? "BYPASS" : "MISS"
			}
		});

		// Store in cache (5 min)
		ctx.waitUntil(cache.put(cacheKey, response.clone()));

		return response;
	}
} satisfies ExportedHandler<Env>;
