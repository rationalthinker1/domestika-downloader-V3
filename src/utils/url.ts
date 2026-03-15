import type { NormalizedUrl } from '../types';
import { toTitleCase } from './strings';

export const DOMESTIKA_URL_PATTERN = /domestika\.org\/.*?\/courses\/(\d+)-([-\w]+)/;

export function normalizeDomestikaUrl(url: string): NormalizedUrl {
	const match = url.match(DOMESTIKA_URL_PATTERN);

	if (match) {
		return {
			url: `https://www.domestika.org/es/courses/${match[1]}/course`,
			courseTitle: toTitleCase(match[2]),
		};
	}

	return { url, courseTitle: null };
}
