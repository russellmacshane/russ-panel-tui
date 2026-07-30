import type {Candidate, Location} from './types.js';

/** Joins whichever of name, admin1, and country are present — never "undefined". */
export function formatLocation(location: Location): string {
	return [location.name, location.admin1, location.country]
		.filter((part): part is string => Boolean(part))
		.join(', ');
}

/** "(37.22, -93.30)" — the disambiguation floor: always present, always unique. */
function formatCoordinates(candidate: Candidate): string {
	return `(${candidate.latitude.toFixed(2)}, ${candidate.longitude.toFixed(2)})`;
}

/** Groups candidates that would otherwise render identically under `formatLocation`. */
function baseKey(candidate: Candidate): string {
	return JSON.stringify([
		candidate.name,
		candidate.admin1 ?? null,
		candidate.country ?? null,
	]);
}

/** `undefined` is its own bucket, distinct from any string value of `admin2`. */
function admin2Key(candidate: Candidate): string {
	return JSON.stringify(candidate.admin2 ?? null);
}

/**
 * Formats every candidate in `candidates` for display so that no two rows are
 * ever indistinguishable (design decision 15's two-tier rule). A candidate
 * that already renders uniquely under `name, admin1, country` gets exactly
 * the label `formatLocation` would produce.
 *
 * A colliding group — same name, region, and country — is split further by
 * `admin2`: a candidate whose `admin2` is unique within the group gets it
 * inserted between the name and the region ("Springfield, Greene County,
 * Missouri"). Where `admin2` is absent or also shared, that still leaves rows
 * that would render identically, so those fall back to appending coordinates
 * ("Springfield, Missouri (37.22, -93.30)") — always present, always unique,
 * the absolute floor the rule guarantees.
 */
export function disambiguateCandidates(
	candidates: readonly Candidate[],
): string[] {
	const baseGroups = new Map<string, Candidate[]>();
	for (const candidate of candidates) {
		const key = baseKey(candidate);
		const group = baseGroups.get(key);
		if (group) {
			group.push(candidate);
		} else {
			baseGroups.set(key, [candidate]);
		}
	}

	const labels = new Map<Candidate, string>();

	for (const group of baseGroups.values()) {
		if (group.length === 1) {
			labels.set(group[0]!, formatLocation(group[0]!));
			continue;
		}

		const admin2Groups = new Map<string, Candidate[]>();
		for (const candidate of group) {
			const key = admin2Key(candidate);
			const subgroup = admin2Groups.get(key);
			if (subgroup) {
				subgroup.push(candidate);
			} else {
				admin2Groups.set(key, [candidate]);
			}
		}

		for (const subgroup of admin2Groups.values()) {
			const distinguishedByAdmin2 =
				subgroup.length === 1 && subgroup[0]!.admin2 !== undefined;

			for (const candidate of subgroup) {
				labels.set(
					candidate,
					distinguishedByAdmin2
						? [
								candidate.name,
								candidate.admin2,
								candidate.admin1,
								candidate.country,
							]
								.filter((part): part is string => Boolean(part))
								.join(', ')
						: `${formatLocation(candidate)} ${formatCoordinates(candidate)}`,
				);
			}
		}
	}

	return candidates.map(candidate => labels.get(candidate)!);
}
