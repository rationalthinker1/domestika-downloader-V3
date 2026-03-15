import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as cliProgress from 'cli-progress';
import { debugLog } from '../utils/debug';
import { logger } from '../utils/logger';
import { waitForFileStable } from '../utils/fs';
import { spawnPromise } from '../utils/process';
import { getLanguageCode } from './language';

export async function embedSubtitles(
	videoPath: string,
	subtitlePaths: string[],
	multiBar?: cliProgress.MultiBar,
	videoTitle?: string
): Promise<boolean> {
	try {
		// Verify files exist
		if (!fs.existsSync(videoPath)) {
			logger.error(`Video file not found: ${videoPath}`, multiBar);
			return false;
		}

		// Wait until the video file has finished writing
		await waitForFileStable(videoPath);

		if (!subtitlePaths || subtitlePaths.length === 0) {
			logger.error('No subtitle files provided', multiBar);
			return false;
		}

		// Validate all subtitle files exist and are valid
		const validSubtitlePaths: string[] = [];
		for (const subPath of subtitlePaths) {
			if (!fs.existsSync(subPath)) {
				logger.warn(`Subtitle file not found: ${subPath}`, multiBar);
				continue;
			}

			// Check file size
			const stats = fs.statSync(subPath);
			if (stats.size === 0) {
				logger.warn(`Subtitle file is empty: ${subPath}`, multiBar);
				continue;
			}

			// Validate subtitle file content
			let subtitleContent: string;
			try {
				subtitleContent = fs.readFileSync(subPath, 'utf-8');
			} catch (error) {
				const err = error as Error;
				logger.warn(`Failed to read subtitle file ${subPath}: ${err.message}`, multiBar);
				debugLog(`[SUBTITLE] Read error: ${err.stack}`);
				continue;
			}

			if (subtitleContent.trim().length === 0) {
				logger.warn(`Subtitle file contains only whitespace: ${subPath}`, multiBar);
				continue;
			}

			// Enhanced SRT validation (should contain sequence numbers, timestamps, and actual text)
			const hasSequenceNumbers = /\d+\s*\n/.test(subtitleContent);
			const hasTimestamps = /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*--?>\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(
				subtitleContent
			);
			const hasTextContent = subtitleContent.split('\n').some((line) => {
				const trimmed = line.trim();
				// Check if line contains actual text (not just numbers or timestamps)
				return (
					trimmed.length > 0 &&
					!trimmed.match(/^\d+$/) && // Not just a number
					!trimmed.match(/^\d{2}:\d{2}:\d{2}/) && // Not just a timestamp
					!trimmed.match(/^--?>/)
				); // Not just an arrow
			});

			if (!hasSequenceNumbers || !hasTimestamps) {
				logger.warn(`Subtitle file not valid SRT: ${subPath}`, multiBar);
				debugLog(
					`[SUBTITLE] Validation failed - hasSequenceNumbers: ${hasSequenceNumbers}, hasTimestamps: ${hasTimestamps}`
				);
				continue;
			}

			if (!hasTextContent) {
				logger.warn(`Subtitle file has no text content: ${subPath}`, multiBar);
				// Still allow it - might be intentional (empty subtitles)
			}

			debugLog(`[SUBTITLE] Validated subtitle file: ${subPath} (${stats.size} bytes)`);
			validSubtitlePaths.push(subPath);
		}

		if (validSubtitlePaths.length === 0) {
			logger.error('No valid subtitle files found', multiBar);
			return false;
		}

		const dir = path.dirname(videoPath);
		const videoExt = path.extname(videoPath);
		const filename = path.basename(videoPath, videoExt);
		const outputPath = path.join(dir, `${filename}_with_subs${videoExt}`);

		// Build ffmpeg args array with multiple subtitle inputs
		// Format: ffmpeg -i video -i sub1 -i sub2 ... -map 0:v:0 -map 0:a:0 -map 1:s:0 -map 2:s:0 ...
		const ffmpegArgs: string[] = ['-i', videoPath];

		// Add all subtitle files as inputs
		for (const subPath of validSubtitlePaths) {
			ffmpegArgs.push('-i', subPath);
		}

		// Map video and audio streams
		ffmpegArgs.push('-map', '0:v:0', '-map', '0:a:0');

		// Map each subtitle stream and set metadata
		for (let i = 0; i < validSubtitlePaths.length; i++) {
			const subPath = validSubtitlePaths[i];
			const langCode = getLanguageCode(subPath);
			const streamIndex = i + 1; // First subtitle input is index 1 (0 is video)
			ffmpegArgs.push(
				'-map',
				`${streamIndex}:s:0`,
				`-c:s:${i}`,
				'mov_text',
				`-metadata:s:s:${i}`,
				`language=${langCode}`
			);
		}

		// Set first subtitle as default
		if (validSubtitlePaths.length > 0) {
			ffmpegArgs.push('-disposition:s:0', 'default');
		}

		// Copy video and audio without re-encoding
		ffmpegArgs.push('-c:v', 'copy', '-c:a', 'copy', outputPath);

		debugLog('Running ffmpeg command to embed subtitles...');
		// Log command for debugging (reconstruct for readability)
		const logCommand = `ffmpeg ${ffmpegArgs.join(' ')}`;
		const truncatedLog =
			logCommand.length > 200 ? `${logCommand.substring(0, 200)}...` : logCommand;
		debugLog(`Command: ${truncatedLog.replace(/\s+/g, ' ')}`);

		try {
			await spawnPromise('ffmpeg', ffmpegArgs);
		} catch (error) {
			const err = error as Error;
			logger.warn(`ffmpeg attempt failed: ${err.message}`, multiBar);
			debugLog(`[FFMPEG] First command error: ${err.stack}`);
			debugLog(`[FFMPEG] Failed command: ${truncatedLog.substring(0, 500)}...`);

			logger.step('Trying alternative ffmpeg method...', multiBar);
			const altArgs: string[] = ['-i', videoPath];
			for (const subPath of validSubtitlePaths) {
				altArgs.push('-i', subPath);
			}
			altArgs.push(
				'-c:v',
				'copy',
				'-c:a',
				'copy',
				'-c:s',
				'mov_text',
				'-disposition:s:0',
				'default',
				outputPath
			);

			try {
				await spawnPromise('ffmpeg', altArgs);
				logger.success('Alternative ffmpeg method succeeded', multiBar);
			} catch (altError) {
				const altErr = altError as Error;
				logger.error(`Alternative ffmpeg method also failed: ${altErr.message}`, multiBar);
				debugLog(`[FFMPEG] Alternative command error: ${altErr.stack}`);
				throw new Error(`Both ffmpeg attempts failed. Last error: ${altErr.message}`);
			}
		}

		// Verify output file was created
		if (!fs.existsSync(outputPath)) {
			logger.error(`Output file was not created: ${outputPath}`, multiBar);
			return false;
		}

		// Get file sizes for verification
		const originalSize = fs.statSync(videoPath).size;
		const outputSize = fs.statSync(outputPath).size;
		debugLog(`Original size: ${originalSize} bytes, Output size: ${outputSize} bytes`);

		if (outputSize < originalSize * 0.9) {
			debugLog(
				'Warning: Output file is significantly smaller than original. This might indicate an error.'
			);
		}

		// If everything went well, replace the original file
		fs.unlinkSync(videoPath);
		fs.renameSync(outputPath, videoPath);
		const videoName = videoTitle ? ` for ${videoTitle}` : '';
		logger.success(`Subtitles embedded (${validSubtitlePaths.length} track(s))${videoName}`, multiBar);

		// Delete all subtitle files after successful embedding
		const baseFilename = path.basename(videoPath, videoExt);
		const deletedPaths = new Set<string>();
		for (const subPath of validSubtitlePaths) {
			try {
				fs.unlinkSync(subPath);
				deletedPaths.add(subPath);
				debugLog(`Deleted subtitle file: ${subPath}`);
			} catch {
				// already gone — ignore
			}
		}

		// Also delete any other .srt files with the same base name that weren't already removed
		try {
			const files = fs.readdirSync(dir);
			for (const f of files) {
				if (!f.startsWith(baseFilename) || !f.endsWith('.srt')) continue;
				const srtFilePath = path.join(dir, f);
				if (deletedPaths.has(srtFilePath)) continue;
				try {
					fs.unlinkSync(srtFilePath);
					debugLog(`Deleted subtitle file: ${srtFilePath}`);
				} catch {
					// already gone — ignore
				}
			}
		} catch {
			debugLog('Warning: Could not clean up all subtitle files');
		}

		return true;
	} catch (error) {
		const err = error as Error;
		logger.error(`Error embedding subtitles: ${err.message}`, multiBar);
		if (err.message.includes('ffmpeg')) {
			logger.error('Make sure ffmpeg is installed and available in your PATH', multiBar);
		}
		return false;
	}
}
