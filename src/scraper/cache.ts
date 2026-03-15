import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Unit } from '../types';
import { getEnvBool, getEnvInt } from '../utils/env';
import { logger } from '../utils/logger';
import { normalizeDomestikaUrl } from '../utils/url';

interface CachedCourse {
	metadata: Unit[];
	timestamp: number;
	courseTitle: string | null;
}

interface CacheStore {
	[normalizedUrl: string]: CachedCourse;
}

const CACHE_FILE = path.join(process.cwd(), 'course-metadata-cache.json');

// Parse env config once at module init
const CACHE_DISABLED = getEnvBool('NO_CACHE');
const CACHE_TTL_MS = getEnvInt('CACHE_TTL', 7 * 24 * 60 * 60 * 1000, 1);

// In-memory cache layer — avoids repeated full-file reads within a session
let memoryCache: CacheStore | null = null;

function loadStore(): CacheStore {
	if (memoryCache !== null) return memoryCache;

	if (!fs.existsSync(CACHE_FILE)) {
		memoryCache = {};
		return memoryCache;
	}

	try {
		const content = fs.readFileSync(CACHE_FILE, 'utf-8');
		memoryCache = JSON.parse(content) as CacheStore;
		return memoryCache;
	} catch (err) {
		logger.warn(`Could not read cache file: ${(err as Error).message}`);
		memoryCache = {};
		return memoryCache;
	}
}

function persistStore(store: CacheStore): void {
	try {
		fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
	} catch (err) {
		logger.warn(`Could not write cache file: ${(err as Error).message}`);
	}
}

function isExpired(entry: CachedCourse): boolean {
	return Date.now() - entry.timestamp >= CACHE_TTL_MS;
}

export function loadCourseMetadata(courseUrl: string): Unit[] | null {
	if (CACHE_DISABLED) return null;

	const { url } = normalizeDomestikaUrl(courseUrl);
	const store = loadStore();
	const entry = store[url];

	if (!entry) return null;
	// Lazy expiry — skip without rewriting the file
	if (isExpired(entry)) return null;

	return entry.metadata;
}

export function saveCourseMetadata(
	courseUrl: string,
	metadata: Unit[],
	courseTitle: string | null
): void {
	if (CACHE_DISABLED) return;

	const { url } = normalizeDomestikaUrl(courseUrl);
	const store = loadStore();

	store[url] = { metadata, timestamp: Date.now(), courseTitle };
	persistStore(store);
}
