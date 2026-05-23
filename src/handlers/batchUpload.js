// ./handlers/batchUpload.js

import { getCacheKey } from '../services/cacheKeyGenerator.js';
import { existsInCache, storeInR2 } from '../services/r2Service.js';
import { downloadImage } from '../services/downloadImage.js';
import { storeUrlMapping, updateMappingWithSize } from '../services/kvService.js';

export async function handleBatchUpload(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        console.log(`[${requestId}] [AUTH] Invalid API key`);
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const { images, skipExisting = true } = await request.json();
    console.log(`[${requestId}] [BATCH] Processing ${images?.length || 0} images, skipExisting: ${skipExisting}`);

    if (!images || !Array.isArray(images)) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request: images array required', requestId }), { status: 400 });
    }

    const results = [];
    let processed = 0;
    let cached = 0;
    let failed = 0;
    let skipped = 0;
    const startTime = Date.now();

    const concurrency = 10;
    for (let i = 0; i < images.length; i += concurrency) {
        const batch = images.slice(i, i + concurrency);
        const batchPromises = batch.map(async (imageUrl) => {
            const itemStartTime = Date.now();
            try {
                const key = await getCacheKey(imageUrl);
                if (skipExisting) {
                    const exists = await existsInCache(key, env, requestId);
                    if (exists) {
                        return { url: imageUrl, status: 'skipped', reason: 'already_cached', time: Date.now() - itemStartTime };
                    }
                }

                const imageData = await downloadImage(imageUrl, env, requestId);
                await storeInR2(key, imageData, env, requestId);

                // Store mapping in KV
                await storeUrlMapping(imageUrl, key, env, requestId);
                await updateMappingWithSize(imageUrl, key, imageData.size, env, requestId);

                return {
                    url: imageUrl,
                    status: 'cached',
                    key,
                    size: imageData.size,
                    downloadTime: imageData.downloadTime,
                    time: Date.now() - itemStartTime,
                };
            } catch (error) {
                return {
                    url: imageUrl,
                    status: 'failed',
                    error: error.message,
                    time: Date.now() - itemStartTime,
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        for (const result of batchResults) {
            results.push(result);
            if (result.status === 'cached') cached++;
            else if (result.status === 'failed') failed++;
            else if (result.status === 'skipped') skipped++;
            processed++;
        }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[${requestId}] [BATCH] Complete: ${cached} cached, ${skipped} skipped, ${failed} failed in ${totalTime}ms`);

    return new Response(JSON.stringify({
        success: true,
        summary: { total: images.length, processed, cached, failed, skipped, totalTimeMs: totalTime },
        results,
        requestId,
    }), { status: 200 });
}
