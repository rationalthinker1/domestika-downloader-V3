import * as fs from 'node:fs';

/**
 * Reads an environment variable as an integer.
 * Returns `fallback` if the variable is unset, empty, or not a valid integer above `min`.
 */
export function getEnvInt(key: string, fallback: number, min = 1): number {
	const raw = process.env[key];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isNaN(parsed) || parsed < min ? fallback : parsed;
}

/**
 * Reads an environment variable as a boolean.
 * Returns true if the value is `'true'` or `'1'` (case-insensitive), false otherwise.
 */
export function getEnvBool(key: string): boolean {
	const raw = process.env[key]?.toLowerCase();
	return raw === 'true' || raw === '1';
}

/**
 * Reads an environment variable as a string.
 * Returns `fallback` if the variable is unset or empty.
 */
export function getEnvString(key: string, fallback: string): string {
	return process.env[key] || fallback;
}

/**
 * Reads a .env file, replaces or appends the given key=value pairs,
 * and writes the result back. Preserves comments and unrelated variables.
 */
export function updateEnvFile(filePath: string, updates: Record<string, string>): void {
	let existing = '';
	try {
		if (fs.existsSync(filePath)) {
			existing = fs.readFileSync(filePath, 'utf8');
		}
	} catch {
		// start fresh if unreadable
	}

	const updatedKeys = new Set(Object.keys(updates));
	const preservedLines: string[] = [];
	const foundKeys = new Set<string>();

	for (const line of existing.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('#') || trimmed === '') {
			preservedLines.push(line);
			continue;
		}
		const key = trimmed.split('=')[0];
		if (updatedKeys.has(key)) {
			foundKeys.add(key);
			// drop — will be re-appended below with new value
			continue;
		}
		preservedLines.push(line);
	}

	const newLines = [...preservedLines];

	// Blank line separator before new credential block (only when appending fresh)
	if (foundKeys.size === 0 && preservedLines.some((l) => l.trim() !== '' && !l.startsWith('#'))) {
		newLines.push('');
	}

	// Add comment header only on first-time write of these keys
	if (foundKeys.size === 0 && preservedLines.every((l) => l.trim() === '' || l.startsWith('#'))) {
		newLines.push('# Domestika Credentials');
	}

	for (const [key, value] of Object.entries(updates)) {
		newLines.push(`${key}=${value}`);
	}

	try {
		fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
	} catch (err) {
		console.warn(`Warning: Could not write ${filePath}: ${(err as Error).message}`);
	}
}
