import React from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

interface Props {
	message: string | null;
	onExit: () => void;
}

export function ErrorPanel({ message, onExit }: Props): React.ReactElement {
	const { isRawModeSupported } = useStdin();
	useInput((_input, key) => {
		if (key.return || _input === 'q') {
			onExit();
		}
	}, { isActive: isRawModeSupported ?? false });

	return (
		<Box flexDirection="column" marginY={1}>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="#FF4D4D"
				paddingX={2}
				paddingY={1}
				marginBottom={1}
			>
				<Box gap={2} marginBottom={1}>
					<Text bold color="#FF4D4D">
						{'  ✖  ERROR'}
					</Text>
				</Box>
				<Text color="#FF6B6B">{message ?? 'An unexpected error occurred.'}</Text>
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
