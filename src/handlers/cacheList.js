// ./handlers/cacheList.js

export async function handleCacheList(url, env, requestId) {
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const cursor = url.searchParams.get('cursor') || undefined;
    const prefix = url.searchParams.get('prefix') || 'images/';

    console.log(`[${requestId}] [LIST] Fetching images from R2: limit=${limit}, cursor=${cursor?.substring(0, 20)}...`);

    const bucket = env.R2_BUCKET;
    const startTime = Date.now();

    try {
        const listOptions = { prefix, limit: Math.min(limit, 100) };
        if (cursor) {
            listOptions.cursor = cursor;
        }

        const listed = await bucket.list(listOptions);

        const images = listed.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            sizeKB: (obj.size / 1024).toFixed(2),
            sizeMB: (obj.size / 1024 / 1024).toFixed(2),
            uploaded: obj.uploaded,
            uploadedISO: obj.uploaded.toISOString(),
            etag: obj.etag,
            httpMetadata: obj.httpMetadata,
            customMetadata: obj.customMetadata
        }));

        const response = {
            success: true,
            totalInThisPage: images.length,
            limit,
            hasMore: !!listed.cursor,
            nextCursor: listed.cursor || null,
            images,
            summary: {
                totalImagesOnPage: images.length,
                totalSizeBytes: images.reduce((sum, img) => sum + img.size, 0),
                totalSizeKB: (images.reduce((sum, img) => sum + img.size, 0) / 1024).toFixed(2),
                totalSizeMB: (images.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024).toFixed(2)
            },
            timeMs: Date.now() - startTime,
            requestId
        };

        console.log(`[${requestId}] [LIST] Found ${images.length} images, total ${response.summary.totalSizeMB}MB in ${response.timeMs}ms`);
        return new Response(JSON.stringify(response, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error(`[${requestId}] [LIST] Error: ${error.message}`);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}