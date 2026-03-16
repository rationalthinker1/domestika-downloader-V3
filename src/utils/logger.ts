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

export interface LoggerImpl {
	info(message: string, multiBar?: cliProgress.MultiBar | null): void;
	success(message: string, multiBar?: cliProgress.MultiBar | null): void;
	warn(message: string, multiBar?: cliProgress.MultiBar | null): void;
	error(message: string, multiBar?: cliProgress.MultiBar | null): void;
	skip(message: string, multiBar?: cliProgress.MultiBar | null): void;
	step(message: string, multiBar?: cliProgress.MultiBar | null): void;
	header(message: string): void;
	list(items: string[]): void;
	debug(message: string, multiBar?: cliProgress.MultiBar | null): void;
}

const defaultLogger: LoggerImpl = {
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

let activeLogger: LoggerImpl = defaultLogger;

export function setLoggerImpl(impl: LoggerImpl): void {
	activeLogger = impl;
}

export const logger: LoggerImpl = {
	info(message, multiBar) { activeLogger.info(message, multiBar); },
	success(message, multiBar) { activeLogger.success(message, multiBar); },
	warn(message, multiBar) { activeLogger.warn(message, multiBar); },
	error(message, multiBar) { activeLogger.error(message, multiBar); },
	skip(message, multiBar) { activeLogger.skip(message, multiBar); },
	step(message, multiBar) { activeLogger.step(message, multiBar); },
	header(message) { activeLogger.header(message); },
	list(items) { activeLogger.list(items); },
	debug(message, multiBar) { activeLogger.debug(message, multiBar); },
};
