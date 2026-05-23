// ./services/base64.js

export function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = String.fromCodePoint(...bytes);
    return btoa(binString);
}

export function fromBase64(base64) {
    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
    return new TextDecoder().decode(bytes);
}