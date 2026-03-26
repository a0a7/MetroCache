/**
 * Metro Transit API Caching Worker
 * Fetches real-time transit data and caches responses for 5 minutes
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
				const data = await res.json() as any[];

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
					error: String(e)
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
	}
} satisfies ExportedHandler<Env>;
