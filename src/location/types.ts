export type Location = {
	name: string;
	latitude: number;
	longitude: number;
	admin1?: string;
	country?: string;
	timezone?: string;
};

/**
 * A geocoding search result. `admin2` and `population` exist only to order
 * and disambiguate a candidate list — they are dropped when a candidate is
 * confirmed and projected down to a `Location`.
 */
export type Candidate = Location & {
	admin2?: string;
	population?: number;
};
