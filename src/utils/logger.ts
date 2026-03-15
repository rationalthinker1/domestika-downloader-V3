import pc from 'picocolors';
import type * as cliProgress from 'cli-progress';

function timestamp(): string {
	return pc.dim(new Date().toLocaleTimeString('en-US', { hour12: false }));
}

function printLine(prefix: string, message: string, multiBar?: cliProgress.MultiBar | null): void {
	const line = `${timestamp()} ${prefix} ${message}`;
	if (multiBar) {
		multiBar.log(`${line}\n`);
	} else {
		process.stdout.write(`${line}\n`);
	}
}

export const logger = {
	info(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.cyan('ℹ'), message, multiBar);
	},

	success(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.green('✔'), pc.green(message), multiBar);
	},

	warn(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.yellow('⚠'), pc.yellow(message), multiBar);
	},

	error(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.red('✖'), pc.red(message), multiBar);
	},

	skip(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.dim('↷'), pc.dim(message), multiBar);
	},

	step(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.magenta('›'), message, multiBar);
	},

	header(message: string): void {
		const width = 50;
		const line = '─'.repeat(width);
		process.stdout.write(`\n${pc.dim(line)}\n${pc.bold(pc.white(` ${message}`))}\n${pc.dim(line)}\n`);
	},

	list(items: string[]): void {
		for (const item of items) {
			process.stdout.write(`  ${pc.dim('·')} ${item}\n`);
		}
	},

	debug(message: string, multiBar?: cliProgress.MultiBar | null): void {
		printLine(pc.dim('[dbg]'), pc.dim(message), multiBar);
	},
};
