//  ./handlers/clearCache.js

import { deleteSingleImage } from '../services/kvService.js';

export async function handleClearOldCache(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const url = new URL(request.url);
    const olderThanDays = parseInt(url.searchParams.get('olderThanDays')) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    console.log(`[${requestId}] [CLEAN] Removing images older than ${olderThanDays} days (before ${cutoffDate.toISOString()})`);

    const bucket = env.R2_BUCKET;
    let deleted = 0;
    let cursor;
    const startTime = Date.now();

    do {
        const list = await bucket.list({ cursor, prefix: 'images/' });
        cursor = list.cursor;
        for (const object of list.objects) {
            if (object.uploaded < cutoffDate) {
                await bucket.delete(object.key);
                deleted++;
            }
        }
    } while (cursor);

    console.log(`[${requestId}] [CLEAN] Deleted ${deleted} images in ${Date.now() - startTime}ms`);
    return new Response(JSON.stringify({
        success: true,
        deleted,
        olderThanDays,
        timeMs: Date.now() - startTime,
        requestId,
    }), { status: 200 });
}

export async function handleDeleteImage(url, env, requestId) {
    const cacheKey = url.searchParams.get('key');
    if (!cacheKey) {
        return new Response(JSON.stringify({ success: false, error: 'key required', requestId }), { status: 400 });
    }
    const result = await deleteSingleImage(cacheKey, env, requestId);
    return new Response(JSON.stringify(result), { 
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' }
    });
}