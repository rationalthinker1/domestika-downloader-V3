import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as cliProgress from 'cli-progress';
import { embedAudioTracks } from '../audio/embed';
import { checkVideoFileExists, getVideoId, saveVideoProgress } from '../csv/progress';
import { embedSubtitles } from '../subtitles/embed';
import type { VideoData } from '../types';
import { debugLog, log } from '../utils/debug';
import { ensureDir, findSubtitleFile, findVideoFile, waitForFileStable } from '../utils/fs';
import { getDownloadPath, getN3u8DLPath } from '../utils/paths';
import { spawnPromise } from '../utils/process';
import { sanitizeFilename } from '../utils/strings';
import { spawnWithProgress } from './progress-bar';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildN3u8Args(
	streamSelector: string,
	playbackURL: string,
	saveDir: string,
	saveName: string,
	subtitleLangs: string[] | null
): string[] {
	return [
		'-sv',
		streamSelector,
		playbackURL,
		'--save-dir',
		saveDir,
		'--save-name',
		saveName,
		'--tmp-dir',
		'.tmp',
		'--log-level',
		'INFO',
		...(subtitleLangs?.length
			? ['--select-audio', `lang=${subtitleLangs.join('|')}:for=best`]
			: []),
	];
}

function markVideoComplete(
	courseUrl: string,
	courseTitle: string | null,
	unitNumber: number,
	unitTitle: string,
	videoIndex: number,
	videoTitle: string,
	completedVideos: Set<string>
): void {
	saveVideoProgress(courseUrl, courseTitle, unitNumber, unitTitle, videoIndex, videoTitle, 'completed');
	completedVideos.add(getVideoId(courseUrl, unitNumber, videoIndex));
}

// ---------------------------------------------------------------------------
// Subtitle download
// ---------------------------------------------------------------------------

interface SubtitleResult {
	lang: string;
	success: boolean;
	path?: string;
	error?: string;
}

async function downloadSubtitleForLang(
	lang: string,
	playbackURL: string,
	saveDir: string,
	fileName: string,
	n3u8dlPath: string,
	multiBar: cliProgress.MultiBar | undefined
): Promise<SubtitleResult> {
	const subtitleArgs = [
		'--auto-subtitle-fix',
		'--sub-format',
		'SRT',
		'--select-subtitle',
		`lang="${lang}":for=all`,
		playbackURL,
		'--save-dir',
		saveDir,
		'--save-name',
		fileName,
		'--tmp-dir',
		'.tmp',
		'--log-level',
		'ERROR',
	];

	debugLog(`[SUBTITLE] Downloading ${lang} subtitles`);
	debugLog(`[SUBTITLE] Command: ${n3u8dlPath} ${subtitleArgs.join(' ')}`);

	try {
		await spawnPromise(n3u8dlPath, subtitleArgs);

		const subPath = findSubtitleFile(saveDir, fileName, lang);

		if (subPath) {
			debugLog(`[SUBTITLE] Found ${lang} subtitle at: ${subPath}`);
			return { lang, success: true, path: subPath };
		}

		log(`⚠️  ${lang.toUpperCase()} subtitles downloaded but file not found`, multiBar);
		return { lang, success: false, error: 'Subtitle file not found after download' };
	} catch (err) {
		const error = err as Error;
		log(`⚠️  Failed to download ${lang.toUpperCase()} subtitles: ${error.message}`, multiBar);
		debugLog(`[SUBTITLE] Error details for ${lang}: ${error.stack}`);
		return { lang, success: false, error: error.message };
	}
}

async function downloadSubtitlesForVideo(
	subtitleLangs: string[],
	playbackURL: string,
	saveDir: string,
	fileName: string,
	n3u8dlPath: string,
	multiBar: cliProgress.MultiBar | undefined
): Promise<string[]> {
	const results: SubtitleResult[] = [];

	for (const lang of subtitleLangs) {
		results.push(
			await downloadSubtitleForLang(lang, playbackURL, saveDir, fileName, n3u8dlPath, multiBar)
		);
	}

	const succeeded = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	if (succeeded.length > 0) {
		log(`✅ Downloaded ${succeeded.length} subtitle language(s)`, multiBar);
	}
	if (failed.length > 0) {
		log(`⚠️  Failed ${failed.length} subtitle language(s): ${failed.map((f) => f.lang).join(', ')}`, multiBar);
	}

	return succeeded.map((r) => r.path as string);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function downloadVideo(
	video: VideoData,
	courseTitle: string | null,
	unitTitle: string,
	videoIndex: number,
	subtitleLangs: string[] | null,
	unitNumber: number,
	multiBar?: cliProgress.MultiBar,
	courseUrl?: string,
	completedVideos?: Set<string>
): Promise<boolean> {
	if (!video.playbackURL) {
		throw new Error(`Invalid video URL for ${video.title}`);
	}

	const saveDir = path.normalize(
		path.join(getDownloadPath(), courseTitle ?? 'Unknown Course', video.section, unitTitle)
	);

	const existingFile = await checkVideoFileExists(
		courseTitle,
		unitTitle,
		unitNumber,
		videoIndex,
		video.title,
		video.section
	);

	if (existingFile) {
		if (courseUrl && completedVideos) {
			markVideoComplete(courseUrl, courseTitle, unitNumber, unitTitle, videoIndex, video.title, completedVideos);
		}
		return true;
	}

	ensureDir(saveDir);

	const fileName = `${sanitizeFilename(courseTitle ?? 'Unknown Course')} - U${unitNumber} - ${videoIndex}_${sanitizeFilename(video.title)}`;
	const n3u8dlPath = getN3u8DLPath();

	// Attempt 1080p, fall back to best quality
	try {
		await spawnWithProgress(
			n3u8dlPath,
			buildN3u8Args('res=1920x1080', video.playbackURL, saveDir, fileName, subtitleLangs),
			video.title,
			multiBar
		);
	} catch {
		await spawnWithProgress(
			n3u8dlPath,
			buildN3u8Args('for=best', video.playbackURL, saveDir, fileName, subtitleLangs),
			video.title,
			multiBar
		);
	}

	// Post-download: subtitles + audio embedding
	if (subtitleLangs && subtitleLangs.length > 0) {
		const subtitlePaths = await downloadSubtitlesForVideo(
			subtitleLangs,
			video.playbackURL,
			saveDir,
			fileName,
			n3u8dlPath,
			multiBar
		);

		const videoPath = findVideoFile(saveDir, fileName);

		if (videoPath) {
			await waitForFileStable(videoPath);

			if (subtitlePaths.length > 0) {
				await embedSubtitles(videoPath, subtitlePaths, multiBar, video.title);
			}

			const m4aFiles = fs
				.readdirSync(saveDir)
				.filter((f) => f.startsWith(fileName) && f.endsWith('.m4a'));

			if (m4aFiles.length > 0) {
				const audioPaths = m4aFiles.map((f) => ({
					lang: f.replace(`${fileName}.`, '').replace('.m4a', ''),
					path: path.join(saveDir, f),
				}));
				await embedAudioTracks(
					videoPath,
					audioPaths,
					subtitleLangs.length === 1,
					multiBar,
					video.title
				);
			}
		}
	}

	if (courseUrl && completedVideos) {
		markVideoComplete(courseUrl, courseTitle, unitNumber, unitTitle, videoIndex, video.title, completedVideos);
	}

	return true;
}
