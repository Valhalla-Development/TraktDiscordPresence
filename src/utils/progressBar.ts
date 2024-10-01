import { SingleBar, Options, Params } from 'cli-progress';
import chalk from 'chalk';
import { DateTime } from 'luxon';
import { ConnectionState } from '../types';
import { appState } from '../state/appState.js';

let progressBar: SingleBar | null = null;

export async function generateProgressBar(): Promise<SingleBar> {
    const formatFunction = (options: Options, params: Params, payload: any) => {
        switch (appState.instanceState) {
        case ConnectionState.Connecting:
            return chalk.magenta.bold('🔒 Connecting to Discord...');
        case ConnectionState.Connected:
            return chalk.green.bold('🎉 Connected to Discord!');
        case ConnectionState.Playing:
            return formatPlayingState(options, params, payload);
        case ConnectionState.NotPlaying:
            return chalk.bold(`📅 ${chalk.green.italic(formatDate())} ${chalk.magenta('|')} ${chalk.red('Trakt:')} Not playing.`);
        case ConnectionState.Disconnected:
            return chalk.red.bold(`⚠️ Discord connection lost. Retrying in ${chalk.blue(appState.countdownTimer.toString())} seconds...`);
        default:
            return chalk.bold(`📅 ${chalk.green.italic(formatDate())} ${chalk.magenta('|')} ${chalk.red('Trakt:')} Not playing.`);
        }
    };

    return new SingleBar({
        format: formatFunction,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: true,
        linewrap: true,
        fps: 1,
        forceRedraw: true,
    });
}

export async function updateProgressBar(content?: string, startedAt?: string, endsAt?: string, type?: string): Promise<void> {
    if (!progressBar) {
        progressBar = await generateProgressBar();
    }

    if (appState.instanceState === ConnectionState.Playing && content && startedAt && endsAt && type) {
        const totalDuration = DateTime.fromISO(endsAt).diff(DateTime.fromISO(startedAt), 'seconds').seconds;
        const elapsedDuration = DateTime.local().diff(DateTime.fromISO(startedAt), 'seconds').seconds;

        progressBar.start(totalDuration, elapsedDuration, {
            content,
            startedAt,
            endsAt,
            type,
        });

        progressBar.update(elapsedDuration);
    } else {
        progressBar.start(0, 0);
    }
}

function formatPlayingState(options: Options, params: Params, payload: any): string {
    const {
        startedAt, endsAt, content, type,
    } = payload;
    const localEndDate = formatDateTime(endsAt);
    const elapsedDuration = calculateElapsedDuration(startedAt);
    const totalDuration = (new Date(endsAt).getTime() - new Date(startedAt).getTime()) / 1000;
    const remainingDuration = Math.max(totalDuration - elapsedDuration, 0);
    const prettyRemainingTime = formatDuration(remainingDuration * 1000);
    const barProgress = generateBarProgress(options, params);

    return chalk.bold(`🎭 ${chalk.italic(`[${type}]`)} ${chalk.yellow(content)} ${barProgress} Finishes At: ${chalk.blue(localEndDate)} ⏳ Remaining: ${chalk.blue(prettyRemainingTime)}`);
}

function generateBarProgress(options: Options, params: Params): string {
    const completeSize = Math.round(params.progress * (options.barsize ?? 0));
    const incompleteSize = (options.barsize ?? 0) - completeSize;
    const complete = (options.barCompleteChar ?? '').repeat(completeSize);
    const incomplete = (options.barIncompleteChar ?? '').repeat(incompleteSize);

    return `${chalk.red(complete)}${chalk.blue(incomplete)}`;
}

function formatDateTime(date: string): string {
    return DateTime.fromISO(date).setZone('local').toLocaleString(DateTime.TIME_SIMPLE);
}

function calculateElapsedDuration(startedAt: string): number {
    return DateTime.local().diff(DateTime.fromISO(startedAt), 'seconds').seconds;
}

function formatDate(): string {
    return DateTime.now().toFormat('h:mm:ss a');
}

function formatDuration(ms: number): string {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}
