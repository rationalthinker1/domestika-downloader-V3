import React from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

interface Props {
	summary: { downloaded: number; skipped: number; failed: number } | null;
	onExit: () => void;
}

interface StatBadgeProps {
	label: string;
	value: number;
	color: string;
}

function StatBadge({ label, value, color }: StatBadgeProps): React.ReactElement {
	return (
		<Box flexDirection="column" alignItems="center" paddingX={3} paddingY={1}>
			<Text bold color={color} >
				{String(value).padStart(3)}
			</Text>
			<Text color="#666666">{label}</Text>
		</Box>
	);
}

export function CompletionSummary({ summary, onExit }: Props): React.ReactElement {
	const { isRawModeSupported } = useStdin();
	useInput((_input, key) => {
		if (key.return || _input === 'q') {
			onExit();
		}
	}, { isActive: isRawModeSupported ?? false });

	return (
		<Box flexDirection="column" alignItems="flex-start" marginY={1}>
			{/* Success banner */}
			<Box
				flexDirection="column"
				borderStyle="double"
				borderColor="#4CAF50"
				paddingX={3}
				paddingY={1}
				marginBottom={1}
			>
				<Box gap={2} marginBottom={1}>
					<Text bold color="#4CAF50">
						{'  ✔  ALL DONE!'}
					</Text>
				</Box>

				{/* Stats row */}
				<Box>
					<StatBadge
						label="DOWNLOADED"
						value={summary?.downloaded ?? 0}
						color="#4CAF50"
					/>
					<Text color="#333333">{'│'}</Text>
					<StatBadge
						label="SKIPPED"
						value={summary?.skipped ?? 0}
						color="#FFB300"
					/>
					{(summary?.failed ?? 0) > 0 && (
						<>
							<Text color="#333333">{'│'}</Text>
							<StatBadge
								label="FAILED"
								value={summary?.failed ?? 0}
								color="#FF4D4D"
							/>
						</>
					)}
				</Box>
			</Box>

			<Box paddingLeft={2}>
				<Text color="#555555">{'Press '}</Text>
				<Text color="#FFD700" bold>{'enter'}</Text>
				<Text color="#555555">{' or '}</Text>
				<Text color="#FFD700" bold>{'q'}</Text>
				<Text color="#555555">{' to exit'}</Text>
			</Box>
		</Box>
	);
}
