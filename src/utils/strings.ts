/**
 * Sanitizes a title for use as a directory or unit name.
 * Strips dots and replaces filesystem-unsafe characters with hyphens.
 */
export function sanitizeTitle(title: string): string {
	return title.replace(/\./g, '').trim().replace(/[/\\?%*:|"<>]/g, '-');
}

/**
 * Sanitizes a string for use as a filename.
 * Replaces filesystem-unsafe characters with underscores and trims trailing whitespace.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, '_').trimEnd();
}

/**
 * Converts a hyphen-separated slug into Title Case.
 * e.g. "web-design-for-beginners" → "Web Design For Beginners"
 */
export function toTitleCase(slug: string): string {
	return slug
		.replace(/-/g, ' ')
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Truncates a string to maxLen characters, appending "..." if truncated.
 */
export function truncateWithEllipsis(str: string, maxLen: number): string {
	return str.length > maxLen ? `${str.substring(0, maxLen - 3)}...` : str;
}

/**
 * Appends chunk to buf, keeping only the last `limit` characters to cap memory usage.
 */
export function appendCapped(buf: string, chunk: string, limit: number): string {
	const result = buf + chunk;
	return result.length > limit ? result.slice(-limit) : result;
}
