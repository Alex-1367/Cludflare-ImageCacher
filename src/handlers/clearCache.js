//  ./handlers/clearCache.js

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

    const bucket = env.MY_BUCKET;
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
