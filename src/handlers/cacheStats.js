// ./handlers/cacheStats.js

import { R2_BUCKET_NAME } from '../utils/constants.js'

export async function handleCacheStats(env, requestId) {
    console.log(`[${requestId}] [STATS] Gathering cache statistics`);
    const bucket = env.R2_BUCKET;
    let totalObjects = 0;
    let totalSize = 0;
    let cursor;
    const startTime = Date.now();

    do {
        const list = await bucket.list({ cursor, prefix: 'images/' });
        cursor = list.cursor;
        totalObjects += list.objects.length;
        for (const object of list.objects) {
            totalSize += object.size;
        }
    } while (cursor);

    console.log(`[${requestId}] [STATS] Found ${totalObjects} objects, ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    return new Response(JSON.stringify({
        success: true,
        totalImages: totalObjects,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        bucket: R2_BUCKET_NAME,
        timeMs: Date.now() - startTime,
        requestId,
    }), { status: 200 });
}