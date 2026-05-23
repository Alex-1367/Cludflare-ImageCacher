// ./services/kvService.js

import { getImageExtension } from './cacheKeyGenerator.js';
import { storeInR2 } from './r2Service.js';

export async function storeImageMapping(imageUrl, propertyId, imageIndex, imageData, env, requestId) {
    try {
        const uniqueId = crypto.randomUUID().slice(0, 8);
        const extension = getImageExtension(imageUrl);
        const cacheKey = `images/${propertyId}_${uniqueId}${extension}`;

        await storeInR2(cacheKey, imageData, env, requestId);

        const urlKvKey = `url:${Buffer.from(imageUrl).toString('base64')}`;
        const mappingData = {
            cacheKey: cacheKey,
            originalUrl: imageUrl,
            propertyId: propertyId,
            imageIndex: imageIndex,
            cachedAt: new Date().toISOString(),
            size: imageData.size,
            sizeKB: (imageData.size / 1024).toFixed(2),
            sizeMB: (imageData.size / 1024 / 1024).toFixed(2)
        };
        await env.IMAGE_MAPPINGS.put(urlKvKey, JSON.stringify(mappingData));

        const propertyKey = `property:${propertyId}`;
        let propertyImages = await env.IMAGE_MAPPINGS.get(propertyKey, 'json');
        if (!propertyImages) {
            propertyImages = { propertyId, images: [] };
        }
        propertyImages.images.push({
            cacheKey: cacheKey,
            originalUrl: imageUrl,
            imageIndex: imageIndex,
            size: imageData.size,
            cachedAt: new Date().toISOString()
        });
        await env.IMAGE_MAPPINGS.put(propertyKey, JSON.stringify(propertyImages));

        console.log(`[${requestId}] [KV] Stored mapping - Property: ${propertyId}, Index: ${imageIndex}, Key: ${cacheKey}`);
        return cacheKey;

    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to store mapping: ${error.message}`);
        throw error;
    }
}

export async function getPropertyImages(propertyId, env, requestId) {
    try {
        const propertyKey = `property:${propertyId}`;
        const propertyImages = await env.IMAGE_MAPPINGS.get(propertyKey, 'json');

        if (!propertyImages) {
            return { success: true, images: [], propertyId, totalCount: 0 };
        }

        const bucket = env.MY_BUCKET;
        const verifiedImages = [];

        for (const img of propertyImages.images) {
            const object = await bucket.head(img.cacheKey);
            if (object) {
                verifiedImages.push({
                    ...img,
                    existsInR2: true,
                    contentType: object.httpMetadata?.contentType,
                    etag: object.etag
                });
            } else {
                verifiedImages.push({ ...img, existsInR2: false });
            }
        }

        return {
            success: true,
            propertyId,
            images: verifiedImages,
            totalCount: verifiedImages.length,
            totalSizeMB: verifiedImages.reduce((sum, img) => sum + (parseFloat(img.sizeMB) || 0), 0).toFixed(2)
        };
    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to get property images: ${error.message}`);
        return { success: false, error: error.message };
    }
}

export async function deletePropertyImages(propertyId, env, requestId) {
    try {
        const propertyKey = `property:${propertyId}`;
        const propertyImages = await env.IMAGE_MAPPINGS.get(propertyKey, 'json');

        if (!propertyImages || !propertyImages.images.length) {
            return { success: true, deletedCount: 0, message: 'No images found for this property' };
        }

        const bucket = env.MY_BUCKET;
        let deletedCount = 0;

        for (const img of propertyImages.images) {
            await bucket.delete(img.cacheKey);
            const urlKvKey = `url:${Buffer.from(img.originalUrl).toString('base64')}`;
            await env.IMAGE_MAPPINGS.delete(urlKvKey);
            const reverseKey = `key:${img.cacheKey}`;
            await env.IMAGE_MAPPINGS.delete(reverseKey);
            deletedCount++;
            console.log(`[${requestId}] [KV] Deleted image: ${img.cacheKey} for property ${propertyId}`);
        }

        await env.IMAGE_MAPPINGS.delete(propertyKey);
        console.log(`[${requestId}] [KV] Deleted ${deletedCount} images for property ${propertyId}`);
        return { success: true, deletedCount, propertyId };

    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to delete property images: ${error.message}`);
        return { success: false, error: error.message };
    }
}

export async function deleteSingleImage(cacheKey, env, requestId) {
    try {
        const reverseKey = `key:${cacheKey}`;
        const originalUrl = await env.IMAGE_MAPPINGS.get(reverseKey);

        if (originalUrl) {
            const urlKvKey = `url:${Buffer.from(originalUrl).toString('base64')}`;
            await env.IMAGE_MAPPINGS.delete(urlKvKey);
            await env.IMAGE_MAPPINGS.delete(reverseKey);

            const listOptions = { prefix: 'property:' };
            let cursor;
            do {
                const listed = await env.IMAGE_MAPPINGS.list(listOptions);
                cursor = listed.cursor;
                for (const key of listed.keys) {
                    const propertyData = await env.IMAGE_MAPPINGS.get(key.name, 'json');
                    if (propertyData && propertyData.images) {
                        const imageIndex = propertyData.images.findIndex(img => img.cacheKey === cacheKey);
                        if (imageIndex !== -1) {
                            propertyData.images.splice(imageIndex, 1);
                            await env.IMAGE_MAPPINGS.put(key.name, JSON.stringify(propertyData));
                            break;
                        }
                    }
                }
            } while (cursor);
        }

        const bucket = env.MY_BUCKET;
        await bucket.delete(cacheKey);

        console.log(`[${requestId}] [KV] Deleted single image: ${cacheKey}`);
        return { success: true, deleted: true, cacheKey };

    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to delete image: ${error.message}`);
        return { success: false, error: error.message };
    }
}

export async function storeUrlMapping(imageUrl, cacheKey, env, requestId) {
    try {
        const kvKey = `url:${Buffer.from(imageUrl).toString('base64')}`;
        const mappingData = {
            cacheKey: cacheKey,
            originalUrl: imageUrl,
            cachedAt: new Date().toISOString(),
            size: 0
        };
        await env.IMAGE_MAPPINGS.put(kvKey, JSON.stringify(mappingData));
        const reverseKey = `key:${cacheKey}`;
        await env.IMAGE_MAPPINGS.put(reverseKey, imageUrl);
        console.log(`[${requestId}] [KV] Stored mapping for: ${imageUrl.substring(0, 60)}... → ${cacheKey}`);
        return true;
    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to store mapping: ${error.message}`);
        return false;
    }
}

export async function getCacheKeyFromUrl(imageUrl, env, requestId) {
    try {
        const kvKey = `url:${Buffer.from(imageUrl).toString('base64')}`;
        const mapping = await env.IMAGE_MAPPINGS.get(kvKey, 'json');
        if (mapping && mapping.cacheKey) {
            console.log(`[${requestId}] [KV] Found mapping: ${imageUrl.substring(0, 60)}... → ${mapping.cacheKey}`);
            return mapping.cacheKey;
        }
        console.log(`[${requestId}] [KV] No mapping found for: ${imageUrl.substring(0, 60)}...`);
        return null;
    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to get mapping: ${error.message}`);
        return null;
    }
}

export async function updateMappingWithSize(imageUrl, cacheKey, size, env, requestId) {
    try {
        const kvKey = `url:${Buffer.from(imageUrl).toString('base64')}`;
        const mapping = await env.IMAGE_MAPPINGS.get(kvKey, 'json');
        if (mapping) {
            mapping.size = size;
            mapping.updatedAt = new Date().toISOString();
            await env.IMAGE_MAPPINGS.put(kvKey, JSON.stringify(mapping));
            console.log(`[${requestId}] [KV] Updated mapping with size: ${size} bytes`);
        }
    } catch (error) {
        console.error(`[${requestId}] [KV] Failed to update mapping: ${error.message}`);
    }
}