// ./services/cacheKeyGenerator.js

export function getImageExtension(imageUrl) {
    const match = imageUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
    if (match) return `.${match[1].toLowerCase()}`;
    return '.jpg';
}

export async function getCacheKey(imageUrl) {
    const encoder = new TextEncoder();
    const data = encoder.encode(imageUrl);
    const hash = await crypto.subtle.digest('MD5', data);
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const extension = getImageExtension(imageUrl);
    return `images/${hashHex}${extension}`;
}