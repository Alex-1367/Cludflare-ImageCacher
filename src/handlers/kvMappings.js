// ./handlers/kvMappings.js

import { fromBase64, toBase64 } from '../services/base64.js'

export async function handleGetUrlMapping(url, env, requestId) {
    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
        return new Response(JSON.stringify({
            success: false,
            error: 'url parameter required',
            requestId
        }), { status: 400 });
    }

    try {
        // FIX: Use toBase64 instead of Buffer.from
        const kvKey = `url:${toBase64(imageUrl)}`;
        const mapping = await env.IMAGE_MAPPINGS.get(kvKey, 'json');

        if (!mapping) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No mapping found for this URL',
                url: imageUrl,
                requestId
            }), { status: 404 });
        }

        const bucket = env.R2_BUCKET;
        const object = await bucket.head(mapping.cacheKey);
        const existsInR2 = object !== null;

        return new Response(JSON.stringify({
            success: true,
            url: imageUrl,
            cacheKey: mapping.cacheKey,
            cachedAt: mapping.cachedAt,
            size: mapping.size,
            sizeKB: mapping.size ? (mapping.size / 1024).toFixed(2) : null,
            existsInR2: existsInR2,
            requestId
        }), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}

export async function handleListUrlMappings(url, env, requestId) {
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const cursor = url.searchParams.get('cursor') || undefined;
    const startTime = Date.now();

    console.log(`[${requestId}] [KV] Listing URL mappings, limit=${limit}`);

    try {
        const listOptions = { prefix: 'url:', limit: Math.min(limit, 100) };
        if (cursor) {
            listOptions.cursor = cursor;
        }

        const listed = await env.IMAGE_MAPPINGS.list(listOptions);

        const mappings = [];
        for (const key of listed.keys) {
            const mapping = await env.IMAGE_MAPPINGS.get(key.name, 'json');
            if (mapping) {
                // Decode the original URL from the key
                let originalUrl = mapping.originalUrl;
                if (!originalUrl) {
                    // Fallback: decode from key name
                    const keyWithoutPrefix = key.name.replace('url:', '');
                    originalUrl = fromBase64(keyWithoutPrefix);
                }

                mappings.push({
                    originalUrl: originalUrl,
                    cacheKey: mapping.cacheKey,
                    cachedAt: mapping.cachedAt,
                    size: mapping.size,
                    sizeKB: mapping.size ? (mapping.size / 1024).toFixed(2) : null,
                    sizeMB: mapping.size ? (mapping.size / 1024 / 1024).toFixed(2) : null
                });
            }
        }

        const response = {
            success: true,
            totalInThisPage: mappings.length,
            limit,
            hasMore: !!listed.cursor,
            nextCursor: listed.cursor || null,
            mappings,
            summary: {
                totalMappings: mappings.length,
                totalSizeBytes: mappings.reduce((sum, m) => sum + (m.size || 0), 0),
                totalSizeMB: (mappings.reduce((sum, m) => sum + (m.size || 0), 0) / 1024 / 1024).toFixed(2)
            },
            timeMs: Date.now() - startTime,
            requestId
        };

        return new Response(JSON.stringify(response, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}

export async function handleDeleteUrlMapping(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const url = new URL(request.url);
    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
        return new Response(JSON.stringify({
            success: false,
            error: 'url parameter required',
            requestId
        }), { status: 400 });
    }

    try {
        const kvKey = `url:${toBase64(imageUrl)}`;
        const mapping = await env.IMAGE_MAPPINGS.get(kvKey, 'json');

        if (!mapping) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No mapping found for this URL',
                requestId
            }), { status: 404 });
        }

        await env.IMAGE_MAPPINGS.delete(kvKey);
        await env.IMAGE_MAPPINGS.delete(`key:${mapping.cacheKey}`);

        const bucket = env.R2_BUCKET;
        await bucket.delete(mapping.cacheKey);

        console.log(`[${requestId}] [KV] Deleted mapping for: ${imageUrl.substring(0, 60)}...`);

        return new Response(JSON.stringify({
            success: true,
            deleted: true,
            url: imageUrl,
            cacheKey: mapping.cacheKey,
            requestId
        }), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            requestId
        }), { status: 500 });
    }
}