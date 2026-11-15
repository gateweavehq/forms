export type DeviceClass = "phone" | "tablet" | "desk";

/**
 * The rough size of the screen, which is all a response stores about a device. A study
 * compares phones with desks; it has no use for a model, a browser or an address.
 */
export function deviceClass(viewportWidth: number): DeviceClass {
	if (viewportWidth < 600) return "phone";
	if (viewportWidth < 1024) return "tablet";
	return "desk";
}
