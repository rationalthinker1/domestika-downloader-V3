import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as cliProgress from 'cli-progress';
import { getLanguageCode } from '../subtitles/language';
import { debugLog, log, logError } from '../utils/debug';
import { spawnPromise } from '../utils/process';

/**
 * Embeds downloaded audio tracks into the video file.
 *
 * If singleLangAsDefault is true (subtitle_langs.length === 1):
 *   - The language audio track becomes the default (track 0)
 *   - The original audio track is demoted to secondary (track 1)
 *
 * Otherwise:
 *   - Original audio stays as default
 *   - Language audio tracks are appended as secondary tracks
 */
export async function embedAudioTracks(
	videoPath: string,
	audioPaths: { lang: string; path: string }[],
	singleLangAsDefault: boolean,
	multiBar?: cliProgress.MultiBar,
	videoTitle?: string
): Promise<boolean> {
	try {
		if (!fs.existsSync(videoPath)) {
			logError(`Error: Video file not found: ${videoPath}`, multiBar);
			return false;
		}

		const validAudioPaths = audioPaths.filter(
			(a) => fs.existsSync(a.path) && fs.statSync(a.path).size > 0
		);

		if (validAudioPaths.length === 0) {
			logError('Error: No valid audio files found', multiBar);
			return false;
		}

		const dir = path.dirname(videoPath);
		const videoExt = path.extname(videoPath);
		const filename = path.basename(videoPath, videoExt);
		const outputPath = path.join(dir, `${filename}_with_audio${videoExt}`);

		const ffmpegArgs: string[] = ['-i', videoPath];

		for (const audio of validAudioPaths) {
			ffmpegArgs.push('-i', audio.path);
		}

		ffmpegArgs.push('-map', '0:v:0');

		if (singleLangAsDefault) {
			// Lang audio as default (track 0), original audio demoted to secondary (track 1)
			ffmpegArgs.push(
				'-map', '1:a:0',
				'-disposition:a:0', 'default',
				'-metadata:s:a:0', `language=${getLanguageCode(validAudioPaths[0].path)}`,
				'-map', '0:a:0',
				'-disposition:a:1', '0'
			);
			for (let i = 1; i < validAudioPaths.length; i++) {
				ffmpegArgs.push(
					'-map', `${i + 1}:a:0`,
					`-disposition:a:${i + 1}`, '0',
					`-metadata:s:a:${i + 1}`, `language=${getLanguageCode(validAudioPaths[i].path)}`
				);
			}
		} else {
			// Original audio stays default, lang audios appended as secondary tracks
			ffmpegArgs.push('-map', '0:a:0', '-disposition:a:0', 'default');
			for (let i = 0; i < validAudioPaths.length; i++) {
				ffmpegArgs.push(
					'-map', `${i + 1}:a:0`,
					`-disposition:a:${i + 1}`, '0',
					`-metadata:s:a:${i + 1}`, `language=${getLanguageCode(validAudioPaths[i].path)}`
				);
			}
		}

		// Preserve existing subtitle tracks (optional — won't fail if none present)
		ffmpegArgs.push('-map', '0:s?');
		ffmpegArgs.push('-c', 'copy', outputPath);

		debugLog('Running ffmpeg to embed audio tracks...');
		debugLog(`Command: ffmpeg ${ffmpegArgs.join(' ')}`);

		await spawnPromise('ffmpeg', ffmpegArgs);

		if (!fs.existsSync(outputPath)) {
			logError(`Error: Output file not created: ${outputPath}`, multiBar);
			return false;
		}

		fs.unlinkSync(videoPath);
		fs.renameSync(outputPath, videoPath);

		const videoName = videoTitle ? ` for ${videoTitle}` : '';
		log(`Embedded ${validAudioPaths.length} audio track(s)${videoName}`, multiBar);

		for (const audio of validAudioPaths) {
			try {
				fs.unlinkSync(audio.path);
				debugLog(`Deleted audio file: ${audio.path}`);
			} catch {
				// already gone — ignore
			}
		}

		return true;
	} catch (error) {
		const err = error as Error;
		logError(`Error embedding audio tracks: ${err.message}`, multiBar);
		return false;
	}
}
