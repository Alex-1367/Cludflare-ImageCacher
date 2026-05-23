// ./handlers/fileUpload.js

import { storeInR2 } from '../services/r2Service.js';
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MB } from '../utils/constants.js';

export async function handleFileUpload(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const propertyId = formData.get('propertyId');
        const imageIndex = formData.get('imageIndex') || '0';
        const originalFilename = formData.get('originalFilename') || file?.name || 'unknown';

        if (!file) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No file provided',
                requestId
            }), { status: 400 });
        }

        if (!propertyId) {
            return new Response(JSON.stringify({
                success: false,
                error: 'propertyId required',
                requestId
            }), { status: 400 });
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return new Response(JSON.stringify({
                success: false,
                error: `Invalid file type: ${file.type}`,
                requestId
            }), { status: 400 });
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            return new Response(JSON.stringify({
                success: false,
                error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB > ${MAX_IMAGE_SIZE_MB}MB`,
                requestId
            }), { status: 400 });
        }

        const uniqueId = crypto.randomUUID().slice(0, 8);
        const extension = file.name?.split('.').pop() || 'jpg';
        const cacheKey = `images/${propertyId}_${uniqueId}.${extension}`;

        const imageData = {
            data: file,
            contentType: file.type,
            size: file.size
        };

        await storeInR2(cacheKey, imageData, env, requestId);

        // Store mapping
        const urlKvKey = `file:${propertyId}_${imageIndex}_${Date.now()}`;
        const mappingData = {
            cacheKey: cacheKey,
            originalFilename: originalFilename,
            propertyId: parseInt(propertyId),
            imageIndex: parseInt(imageIndex),
            cachedAt: new Date().toISOString(),
            size: file.size,
            sizeKB: (file.size / 1024).toFixed(2),
            sizeMB: (file.size / 1024 / 1024).toFixed(2),
            source: 'local-upload'
        };
        await env.IMAGE_MAPPINGS.put(urlKvKey, JSON.stringify(mappingData));

        // Update property images list
        const propertyKey = `property:${propertyId}`;
        let propertyImages = await env.IMAGE_MAPPINGS.get(propertyKey, 'json');
        if (!propertyImages) {
            propertyImages = { propertyId: parseInt(propertyId), images: [] };
        }
        propertyImages.images.push({
            cacheKey: cacheKey,
            originalFilename: originalFilename,
            imageIndex: parseInt(imageIndex),
            size: file.size,
            cachedAt: new Date().toISOString(),
            source: 'local-upload'
        });
        await env.IMAGE_MAPPINGS.put(propertyKey, JSON.stringify(propertyImages));

        return new Response(JSON.stringify({
            success: true,
            status: 'cached',
            key: cacheKey,
            propertyId: parseInt(propertyId),
            imageIndex: parseInt(imageIndex),
            originalFilename: originalFilename,
            size: file.size,
            sizeKB: (file.size / 1024).toFixed(2),
            sizeMB: (file.size / 1024 / 1024).toFixed(2),
            requestId,
        }), { status: 200 });

    } catch (error) {
        console.error(`[${requestId}] [FILE-UPLOAD] Error: ${error.message}`);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}