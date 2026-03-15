import * as fs from 'node:fs';
import * as path from 'node:path';

const STABLE_CHECKS_REQUIRED = 3;
export const VIDEO_EXTENSIONS = ['.mp4', '.m3u8', '.ts', '.mkv', '.avi'];

/**
 * Waits until a file's size stops changing for STABLE_CHECKS_REQUIRED consecutive
 * intervals, indicating the write is complete. Throws if maxWaitMs elapses without
 * the file stabilising and the file is still missing or empty.
 */
export async function waitForFileStable(
	filePath: string,
	maxWaitMs = 30000,
	checkIntervalMs = 500
): Promise<void> {
	const deadline = Date.now() + maxWaitMs;
	let lastSize = -1;
	let stableCount = 0;

	while (Date.now() < deadline) {
		if (!fs.existsSync(filePath)) {
			await sleep(checkIntervalMs);
			continue;
		}

		const { size } = fs.statSync(filePath);

		if (size === lastSize) {
			stableCount++;
			if (stableCount >= STABLE_CHECKS_REQUIRED) {
				// Extra buffer to ensure the OS has flushed
				await sleep(1000);
				return;
			}
		} else {
			stableCount = 0;
			lastSize = size;
		}

		await sleep(checkIntervalMs);
	}

	// Timed out — accept if the file exists and is non-empty
	try {
		if (fs.statSync(filePath).size > 0) return;
	} catch {
		// file doesn't exist — fall through to throw
	}

	throw new Error(`File ${filePath} did not stabilise within ${maxWaitMs}ms`);
}

/**
 * Returns the path of the first file in `dir` whose name starts with `baseName`
 * and has a recognised video extension. Returns null if none found.
 */
export function findVideoFile(dir: string, baseName: string): string | null {
	let files: string[];
	try {
		files = fs.readdirSync(dir);
	} catch {
		return null;
	}

	const match = files.find(
		(f) => f.startsWith(baseName) && VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase())
	);

	return match ? path.join(dir, match) : null;
}

/**
 * Searches `dir` for an SRT file associated with `lang`.
 * Checks known naming patterns first, then falls back to a directory scan.
 * Returns the full path if found, or null.
 */
export function findSubtitleFile(dir: string, baseName: string, lang: string): string | null {
	const candidates = [
		path.join(dir, `${baseName}.${lang}.srt`),
		path.join(dir, `${baseName}.srt`),
		path.join(dir, `${baseName}_${lang}.srt`),
		path.join(dir, `subtitle_${lang}.srt`),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}

	// Fallback: scan directory for any .srt containing the lang code
	let files: string[];
	try {
		files = fs.readdirSync(dir);
	} catch {
		return null;
	}

	const found = files.find(
		(f) =>
			f.endsWith('.srt') &&
			(f.includes(`.${lang}.`) || f.includes(`_${lang}.`) || f.includes(`-${lang}.`))
	);

	return found ? path.join(dir, found) : null;
}

/**
 * Creates `dir` (and any parents) if it does not already exist.
 */
export function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
