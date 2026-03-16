import React from 'react';
import { Box, Text } from 'ink';

const LOGO_LINES = [
	' ██████╗  ██████╗ ███╗   ███╗███████╗███████╗████████╗██╗██╗  ██╗ █████╗ ',
	' ██╔══██╗██╔═══██╗████╗ ████║██╔════╝██╔════╝╚══██╔══╝██║██║ ██╔╝██╔══██╗',
	' ██║  ██║██║   ██║██╔████╔██║█████╗  ███████╗   ██║   ██║█████╔╝ ███████║',
	' ██║  ██║██║   ██║██║╚██╔╝██║██╔══╝  ╚════██║   ██║   ██║██╔═██╗ ██╔══██║',
	' ██████╔╝╚██████╔╝██║ ╚═╝ ██║███████╗███████║   ██║   ██║██║  ██╗██║  ██║',
	' ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝',
];

const GRADIENT_COLORS = ['#FF4D4D', '#FF6B35', '#FF8C00', '#FFA500', '#FFB300', '#FFC107'];

export function Header(): React.ReactElement {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{LOGO_LINES.map((line, i) => (
				<Text key={i} color={GRADIENT_COLORS[i % GRADIENT_COLORS.length]} bold>
					{line}
				</Text>
			))}
			<Box marginTop={0} gap={0}>
				<Text color="#FF6B35">{'  '}</Text>
				<Text color="#FF8C00">{'─'.repeat(71)}</Text>
			</Box>
			<Box>
				<Text color="#FF6B35">{'  '}</Text>
				<Text bold color="#FFD700">{'  COURSE DOWNLOADER'}</Text>
				<Text color="#555555">{'  ·  v3.1.0  ·  PandaSekh'}</Text>
			</Box>
			<Box gap={0}>
				<Text color="#FF6B35">{'  '}</Text>
				<Text color="#FF8C00">{'─'.repeat(71)}</Text>
			</Box>
		</Box>
	);
}
