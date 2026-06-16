// ./handlers/imageInfo.js

export async function handleImageInfo(url, env, requestId) {
    const imageKey = url.searchParams.get('key');

    if (!imageKey) {
        return new Response(JSON.stringify({
            success: false,
            error: 'key parameter required',
            requestId
        }), { status: 400 });
    }

    console.log(`[${requestId}] [INFO] Getting metadata for: ${imageKey}`);

    const bucket = env.R2_BUCKET;

    try {
        const object = await bucket.head(imageKey);

        if (!object) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Image not found',
                key: imageKey,
                requestId
            }), { status: 404 });
        }

        return new Response(JSON.stringify({
            success: true,
            key: imageKey,
            size: object.size,
            sizeKB: (object.size / 1024).toFixed(2),
            sizeMB: (object.size / 1024 / 1024).toFixed(2),
            uploaded: object.uploaded,
            uploadedISO: object.uploaded.toISOString(),
            etag: object.etag,
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
            requestId
        }, null, 2), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}

export function getContentType(extension) {
    const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
    };
    return types[extension] || 'image/jpeg';
}
