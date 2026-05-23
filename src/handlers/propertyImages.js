// ./handlers/propertyImages.js

import { downloadImage } from '../services/downloadImage.js';
import { storeImageMapping, getPropertyImages, deletePropertyImages } from '../services/kvService.js';

export async function handlePropertyBatchUpload(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const { propertyId, images } = await request.json();
    console.log(`[${requestId}] [BATCH-PROPERTY] Property: ${propertyId}, Images: ${images?.length || 0}`);

    if (!propertyId) {
        return new Response(JSON.stringify({ success: false, error: 'propertyId required', requestId }), { status: 400 });
    }

    if (!images || !Array.isArray(images)) {
        return new Response(JSON.stringify({ success: false, error: 'images array required', requestId }), { status: 400 });
    }

    const results = [];
    let cached = 0;
    let failed = 0;
    const startTime = Date.now();

    // Process images sequentially to avoid overwhelming
    for (const img of images) {
        try {
            const imageData = await downloadImage(img.url, env, requestId);
            const cacheKey = await storeImageMapping(img.url, propertyId, img.index, imageData, env, requestId);

            results.push({
                url: img.url,
                index: img.index,
                status: 'cached',
                key: cacheKey,
                size: imageData.size
            });
            cached++;
        } catch (error) {
            results.push({
                url: img.url,
                index: img.index,
                status: 'failed',
                error: error.message
            });
            failed++;
        }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[${requestId}] [BATCH-PROPERTY] Complete: ${cached} cached, ${failed} failed in ${totalTime}ms`);

    return new Response(JSON.stringify({
        success: true,
        propertyId,
        summary: { total: images.length, cached, failed, totalTimeMs: totalTime },
        results,
        requestId,
    }), { status: 200 });
}

export async function handleGetPropertyImages(url, env, requestId) {
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'propertyId required',
            requestId 
        }), { status: 400 });
    }
    
    const result = await getPropertyImages(propertyId, env, requestId);
    return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function handleDeletePropertyImages(url, env, requestId) {
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'propertyId required',
            requestId 
        }), { status: 400 });
    }
    
    const result = await deletePropertyImages(propertyId, env, requestId);
    return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' }
    });
}