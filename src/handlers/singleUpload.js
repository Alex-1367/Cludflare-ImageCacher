// ./handlers/singleUpload.js

import { downloadImage } from '../services/downloadImage.js';
import { storeImageMapping } from '../services/kvService.js';

export async function handleSingleUpload(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const { imageUrl, propertyId, imageIndex, forceUpdate = false } = await request.json();
    console.log(`[${requestId}] [SINGLE] Property: ${propertyId}, Index: ${imageIndex}, URL: ${imageUrl?.substring(0, 80)}...`);

    if (!imageUrl) {
        return new Response(JSON.stringify({ success: false, error: 'imageUrl required', requestId }), { status: 400 });
    }

    if (!propertyId) {
        return new Response(JSON.stringify({ success: false, error: 'propertyId required', requestId }), { status: 400 });
    }

    const startTime = Date.now();

    try {
        // Download the image
        const imageData = await downloadImage(imageUrl, env, requestId);

        // Store with property ID and generate unique key
        const cacheKey = await storeImageMapping(imageUrl, propertyId, imageIndex, imageData, env, requestId);

        return new Response(JSON.stringify({
            success: true,
            status: 'cached',
            key: cacheKey,
            propertyId: propertyId,
            imageIndex: imageIndex,
            size: imageData.size,
            sizeKB: (imageData.size / 1024).toFixed(2),
            downloadTimeMs: imageData.downloadTime,
            totalTimeMs: Date.now() - startTime,
            requestId,
        }), { status: 200 });

    } catch (error) {
        console.error(`[${requestId}] [SINGLE] Error: ${error.message}`);

        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}