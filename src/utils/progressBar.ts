import { SingleBar, Options, Params } from 'cli-progress';
import chalk from 'chalk';
import { DateTime } from 'luxon';
import { ConnectionState, ProgressBarPayload } from '../types';
import { appState } from '../state/appState.js';

let progressBar: SingleBar | null = null;

export function initializeProgressBar(): void {
    if (!progressBar) {
        progressBar = generateProgressBar();
    }
    updateProgressBar();
}

export function generateProgressBar(): SingleBar {
    const formatFunction = (options: Options, params: Params, payload: ProgressBarPayload) => {
        switch (appState.instanceState) {
        case ConnectionState.Connecting:
            return chalk.yellow('🔄 Initializing application...');
        case ConnectionState.Connected:
            return chalk.green('✅ Application started successfully. Waiting for Trakt activity...');
        case ConnectionState.Playing:
            return formatPlayingState(options, params, payload);
        case ConnectionState.NotPlaying:
            return chalk.blue(`📅 ${chalk.green.italic(formatDate())} ${chalk.magenta('|')} ${chalk.red('Trakt:')} Not playing.`);
        case ConnectionState.Disconnected:
            return chalk.red(`⚠️ Discord connection lost. Retrying in ${chalk.blue(appState.countdownTimer.toString())} seconds...`);
        case ConnectionState.Error:
            return chalk.red(`❌ Error: ${payload.error} Retrying in ${chalk.blue(appState.countdownTimer.toString())} seconds...`);
        default:
            return chalk.blue(`📅 ${chalk.green.italic(formatDate())} ${chalk.magenta('|')} ${chalk.red('Trakt:')} Not playing.`);
        }
    };

    return new SingleBar({
        format: formatFunction,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false,
        linewrap: true,
        fps: 1,
        forceRedraw: true,
    });
}

export function updateProgressBar(payload?: ProgressBarPayload): void {
    if (!progressBar) {
        progressBar = generateProgressBar();
    }

    if (appState.instanceState === ConnectionState.Playing && payload?.content && payload?.startedAt && payload?.endsAt && payload?.type) {
        const totalDuration = DateTime.fromISO(payload.endsAt).diff(DateTime.fromISO(payload.startedAt), 'seconds').seconds;
        const elapsedDuration = DateTime.local().diff(DateTime.fromISO(payload.startedAt), 'seconds').seconds;

        progressBar.start(totalDuration, elapsedDuration, payload);
        progressBar.update(elapsedDuration);
    } else {
        progressBar.start(100, 0, payload);
        progressBar.update(0);
    }
}

function formatPlayingState(options: Options, params: Params, payload: ProgressBarPayload): string {
    const {
        startedAt, endsAt, content, type,
    } = payload;
    if (!startedAt || !endsAt || !content || !type) {
        return 'Invalid payload for playing state';
    }

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
