// ./handlers/cacheStatus.js

import { getCacheKey } from '../services/cacheKeyGenerator.js';
import { existsInCache } from '../services/r2Service.js';
import { R2_BUCKET_NAME } from '../utils/constants.js';

export async function handleCacheStatus(url, env, requestId) {
    const imageUrl = url.searchParams.get('url');
    if (!imageUrl) {
        return new Response(JSON.stringify({ success: false, error: 'url parameter required', requestId }), { status: 400 });
    }

    const key = await getCacheKey(imageUrl);
    const exists = await existsInCache(key, env, requestId);

    let metadata = null;
    if (exists) {
        const object = await env.MY_BUCKET.head(key);
        metadata = object?.customMetadata;
    }

    return new Response(JSON.stringify({
        success: true,
        url: imageUrl,
        cached: exists,
        key: exists ? key : null,
        metadata,
        requestId,
    }), { status: 200 });
}
