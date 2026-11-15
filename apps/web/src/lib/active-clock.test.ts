import { describe, expect, it } from "vitest";
import { ActiveClock } from "./active-clock";
import { deviceClass } from "./device";

/** A clock the test moves by hand. */
function hands() {
	let now = 1_000;
	return {
		now: () => now,
		pass: (ms: number) => {
			now += ms;
		},
	};
}

describe("the active clock", () => {
	it("counts the time a question was on screen", () => {
		const time = hands();
		const clock = new ActiveClock(true, time.now);
		time.pass(2_400);
		expect(clock.take()).toBe(2_400);
	});

	it("stops while the tab is hidden", () => {
		const time = hands();
		const clock = new ActiveClock(true, time.now);
		time.pass(1_000);
		clock.setVisible(false);
		time.pass(60_000);
		clock.setVisible(true);
		time.pass(500);
		expect(clock.take()).toBe(1_500);
	});

	it("starts again from zero once the time is taken", () => {
		const time = hands();
		const clock = new ActiveClock(true, time.now);
		time.pass(700);
		clock.take();
		time.pass(300);
		expect(clock.take()).toBe(300);
	});

	it("counts nothing for a tab that was opened in the background", () => {
		const time = hands();
		const clock = new ActiveClock(false, time.now);
		time.pass(5_000);
		expect(clock.take()).toBe(0);
		clock.setVisible(true);
		time.pass(200);
		expect(clock.take()).toBe(200);
	});

	it("is not confused by hearing the same thing twice", () => {
		const time = hands();
		const clock = new ActiveClock(true, time.now);
		time.pass(100);
		clock.setVisible(true);
		time.pass(100);
		clock.setVisible(false);
		clock.setVisible(false);
		time.pass(100);
		expect(clock.take()).toBe(200);
	});
});

describe("the device class", () => {
	it("is the rough size of the screen and nothing else", () => {
		expect(deviceClass(320)).toBe("phone");
		expect(deviceClass(390)).toBe("phone");
		expect(deviceClass(599)).toBe("phone");
		expect(deviceClass(600)).toBe("tablet");
		expect(deviceClass(1023)).toBe("tablet");
		expect(deviceClass(1024)).toBe("desk");
		expect(deviceClass(1920)).toBe("desk");
	});
});
