import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { useAppState } from './useAppState';
import { Header } from './components/Header';
import { AuthPrompt, ConfirmPrompt } from './components/AuthPrompt';
import { CourseList } from './components/CourseList';
import { DownloadDashboard } from './components/DownloadDashboard';
import { VideoSelector } from './components/VideoSelector';
import { CompletionSummary } from './components/CompletionSummary';
import { ErrorPanel } from './components/ErrorPanel';

interface Props {
	onReady: () => void;
}

export function InkApp({ onReady }: Props): React.ReactElement {
	const { state } = useAppState();
	const { exit } = useApp();

	// Signal the imperative main() that the UI is mounted and ready
	useEffect(() => {
		onReady();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const renderContent = () => {
		// Auth / confirm prompts take priority over phase rendering
		if (state.pendingPrompt) {
			const prompt = state.pendingPrompt;

			if (prompt.type === 'text') {
				return (
					<>
						<CourseList
							courses={state.courses}
							scraping={state.scraping}
							scrapeUnitCount={state.scrapeUnitCount}
						/>
						<AuthPrompt prompt={prompt} />
					</>
				);
			}

			if (prompt.type === 'confirm') {
				return (
					<>
						<CourseList
							courses={state.courses}
							scraping={state.scraping}
							scrapeUnitCount={state.scrapeUnitCount}
						/>
						<ConfirmPrompt prompt={prompt} />
					</>
				);
			}

			if (prompt.type === 'checkbox') {
				return <VideoSelector prompt={prompt} />;
			}
		}

		switch (state.phase) {
			case 'starting':
				return (
					<Box paddingLeft={2} marginY={1}>
						<Box gap={1}>
							<Box>
								{/* Simple dots spinner via text rotation */}
								<Text color="#FF8C00">{'⣾ '}</Text>
							</Box>
							<Text color="#888888">{'Initializing...'}</Text>
						</Box>
					</Box>
				);

			case 'auth':
				if (state.pendingPrompt) {
					return <AuthPrompt prompt={state.pendingPrompt} />;
				}
				return null;

			case 'running':
				return (
					<CourseList
						courses={state.courses}
						scraping={state.scraping}
						scrapeUnitCount={state.scrapeUnitCount}
					/>
				);

			case 'downloading':
				return (
					<>
						<CourseList
							courses={state.courses}
							scraping={state.scraping}
							scrapeUnitCount={state.scrapeUnitCount}
						/>
						<DownloadDashboard downloads={state.downloads} logs={state.logs} />
					</>
				);

			case 'video-select':
				if (state.pendingPrompt) {
					return <VideoSelector prompt={state.pendingPrompt} />;
				}
				return null;

			case 'summary':
				return (
					<CompletionSummary
						summary={state.summary}
						onExit={exit}
					/>
				);

			case 'error':
				return (
					<ErrorPanel
						message={state.errorMessage}
						onExit={exit}
					/>
				);

			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" paddingX={1}>
			<Header />
			{renderContent()}
		</Box>
	);
}
