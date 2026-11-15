/**
 * Measures how long a question was in front of the person: the time since it was shown, minus
 * the time the tab was hidden. A tab left open over lunch must not look like a long think.
 */
export class ActiveClock {
	readonly #now: () => number;
	#total = 0;
	/** When the current visible stretch began, or nothing while hidden. */
	#since: number | undefined;

	constructor(visible: boolean, now: () => number = () => performance.now()) {
		this.#now = now;
		if (visible) this.#since = now();
	}

	/** Call when the tab becomes visible or hidden. */
	setVisible(visible: boolean): void {
		if (visible && this.#since === undefined) {
			this.#since = this.#now();
		} else if (!visible && this.#since !== undefined) {
			this.#total += this.#now() - this.#since;
			this.#since = undefined;
		}
	}

	/** The active time so far, in whole milliseconds, and starts counting again from zero. */
	take(): number {
		const now = this.#now();
		const running = this.#since === undefined ? 0 : now - this.#since;
		const total = this.#total + running;
		this.#total = 0;
		if (this.#since !== undefined) this.#since = now;
		return Math.max(0, Math.round(total));
	}
}
