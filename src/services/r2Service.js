// ./services/r2Service.js

import { CACHE_TTL_SECONDS, SUPPORTED_FORMATS, MAX_IMAGE_SIZE_BYTES } from '../utils/constants.js';

export async function storeInR2(key, imageData, env, requestId) {
    console.log(`[${requestId}] [STORAGE] Storing to R2: ${key}`);
    const bucket = env.R2_BUCKET;  // Changed from MY_BUCKET to R2_BUCKET
    const storeStart = Date.now();

    await bucket.put(key, imageData.data, {
        httpMetadata: { contentType: imageData.contentType },
        customMetadata: {
            originalSize: String(imageData.size),
            cachedAt: new Date().toISOString(),
            contentType: imageData.contentType,
        },
    });

    const storeTime = Date.now() - storeStart;
    console.log(`[${requestId}] [STORAGE] Stored ${imageData.size} bytes in ${storeTime}ms`);
    return key;
}

export async function existsInCache(key, env, requestId) {
    const bucket = env.R2_BUCKET;  // Changed from MY_BUCKET to R2_BUCKET
    const object = await bucket.head(key);
    const exists = object !== null;
    console.log(`[${requestId}] [CACHE] ${exists ? 'Hit' : 'Miss'}: ${key}`);
    return exists;
}

export async function getFromR2(key, env, requestId) {
    const bucket = env.R2_BUCKET;  // Changed from MY_BUCKET to R2_BUCKET
    return await bucket.get(key);
}

export async function deleteFromR2(key, env, requestId) {
    const bucket = env.R2_BUCKET;  // Changed from MY_BUCKET to R2_BUCKET
    await bucket.delete(key);
    console.log(`[${requestId}] [R2] Deleted: ${key}`);
}

export async function listR2Images(env, prefix, limit, cursor, requestId) {
    const bucket = env.R2_BUCKET;  // Changed from MY_BUCKET to R2_BUCKET
    const listOptions = { prefix, limit: Math.min(limit, 100) };
    if (cursor) listOptions.cursor = cursor;
    return await bucket.list(listOptions);
}