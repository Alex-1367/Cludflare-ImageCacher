// ./handlers/serveImage.js

import { CACHE_TTL_SECONDS } from '../utils/constants.js'; 

export async function handleServeImage(url, request, env, requestId) {
    let imageKey = url.pathname.split('/image/')[1];

    if (!imageKey.startsWith('images/')) {
        imageKey = `images/${imageKey}`;
    }

    console.log(`[${requestId}] [SERVE] Requesting: ${imageKey}`);

    const bucket = env.R2_BUCKET;
    const object = await bucket.get(imageKey);

    if (!object) {
        console.log(`[${requestId}] [SERVE] Not found: ${imageKey}`);
        return new Response(JSON.stringify({ success: false, error: 'Image not found in cache', requestId }), { status: 404 });
    }

    const headers = {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'ETag': object.etag,
        'X-Cache-Hit': 'true',
    };

    console.log(`[${requestId}] [SERVE] Served ${object.size} bytes, type: ${headers['Content-Type']}`);
    return new Response(object.body, { headers });
}

