import { type Progress, RequestFailed } from "./client";

/** How long to wait before sending again after a failure, growing up to half a minute. */
const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * Sends answers to the server one at a time and in order, and keeps the ones that did not
 * arrive until they do. The person goes on meanwhile: a slow connection on a phone must not
 * make the next card wait, and an answer must not be lost to it either.
 */
export class SaveQueue {
	readonly #send: (progress: Progress) => Promise<void>;
	readonly #onFailing: (failing: boolean) => void;
	readonly #waiting: Progress[] = [];
	#sending = false;
	#failures = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#idle: Array<() => void> = [];

	constructor(send: (progress: Progress) => Promise<void>, onFailing: (failing: boolean) => void) {
		this.#send = send;
		this.#onFailing = onFailing;
	}

	/** Adds something to send, after everything already waiting. */
	push(progress: Progress): void {
		this.#waiting.push(progress);
		void this.#drain();
	}

	/** Tries again now instead of waiting for the next retry. */
	retry(): void {
		clearTimeout(this.#timer);
		void this.#drain();
	}

	/** Resolves once everything pushed so far has arrived. */
	settled(): Promise<void> {
		if (this.#waiting.length === 0 && !this.#sending) return Promise.resolve();
		return new Promise((resolve) => this.#idle.push(resolve));
	}

	/** Stops retrying, when the page that owns the queue goes away. */
	stop(): void {
		clearTimeout(this.#timer);
	}

	async #drain(): Promise<void> {
		if (this.#sending) return;
		this.#sending = true;
		clearTimeout(this.#timer);
		while (this.#waiting.length > 0) {
			const next = this.#waiting[0] as Progress;
			try {
				await this.#send(next);
			} catch (error) {
				const refused =
					error instanceof RequestFailed &&
					error.status >= 400 &&
					error.status < 500 &&
					error.status !== 408 &&
					error.status !== 429;
				// What the server refused will be refused again: sending it forever would hold
				// every later answer back behind it.
				if (!refused) {
					this.#sending = false;
					this.#failed();
					return;
				}
			}
			this.#waiting.shift();
			if (this.#failures > 0) {
				this.#failures = 0;
				this.#onFailing(false);
			}
		}
		this.#sending = false;
		for (const resolve of this.#idle.splice(0)) resolve();
	}

	#failed(): void {
		const delay = RETRY_DELAYS[Math.min(this.#failures, RETRY_DELAYS.length - 1)];
		this.#failures++;
		this.#onFailing(true);
		this.#timer = setTimeout(() => void this.#drain(), delay);
	}
}
