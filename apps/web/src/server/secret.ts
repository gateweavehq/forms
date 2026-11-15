const encoder = new TextEncoder();

/** Bytes as text that is safe in an address: base64url, no padding. */
function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
	try {
		const raw = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
		return Uint8Array.from(raw, (character) => character.charCodeAt(0));
	} catch {
		return undefined;
	}
}

/** That many random bytes, as text. */
export function randomToken(bytes: number): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function key(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

/** What the secret signs: the response it belongs to, so a seal is no use for another one. */
function message(responseId: string): Uint8Array<ArrayBuffer> {
	return encoder.encode(`gateweave-forms response ${responseId}`);
}

/**
 * What the database keeps in place of a response's secret: the response's id, signed with the
 * secret as the key. It proves the secret to whoever presents it and gives nothing away to
 * whoever reads the database.
 */
export async function sealSecret(responseId: string, secret: string): Promise<string> {
	const signature = await crypto.subtle.sign("HMAC", await key(secret), message(responseId));
	return toBase64Url(new Uint8Array(signature));
}

/** Whether this is the response's secret. */
export async function secretMatches(
	responseId: string,
	secret: string,
	seal: string,
): Promise<boolean> {
	const signature = fromBase64Url(seal);
	// An empty key cannot be imported, and nothing was ever sealed with one.
	if (!signature || secret === "") return false;
	// `verify` compares in constant time.
	return crypto.subtle.verify("HMAC", await key(secret), signature, message(responseId));
}
