const R2_BUCKET_NAME = 'r2prus';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_IMAGE_SIZE_MB = 20;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const SUPPORTED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

// Allowed origins
const ALLOWED_ORIGINS = [
    'https://admin.imbcargo-montenegro.com',
    'https://wwww.imbcargo-montenegro.com',
    'https://imbcargo-montenegro.com',
    'http://localhost:4200',
    'http://localhost:8787',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:8787',
    'https://prus-api2.burgas275.workers.dev',
];

function isValidApiKey(request, env) {
    const providedKey = request.headers.get('X-API-Key');
    const expectedKey = env.API_KEY;

    // Debug - show exact values
    console.log(`[AUTH] Provided RAW: "${providedKey}"`);
    console.log(`[AUTH] Expected RAW: "${expectedKey}"`);
    console.log(`[AUTH] Provided length: ${providedKey?.length}`);
    console.log(`[AUTH] Expected length: ${expectedKey?.length}`);
    console.log(`[AUTH] Strict equals: ${providedKey === expectedKey}`);

    // Try trimming quotes if present
    const cleanExpected = expectedKey?.replace(/^['"]|['"]$/g, '');
    const cleanProvided = providedKey?.replace(/^['"]|['"]$/g, '');

    console.log(`[AUTH] Clean provided: "${cleanProvided}"`);
    console.log(`[AUTH] Clean expected: "${cleanExpected}"`);
    console.log(`[AUTH] Clean equals: ${cleanProvided === cleanExpected}`);

    if (!expectedKey) {
        console.error('[AUTH] API_KEY not configured in environment!');
        return false;
    }

    if (!providedKey) {
        console.log('[AUTH] No API key provided');
        return false;
    }

    // Compare cleaned versions
    return cleanProvided === cleanExpected;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;
        const startTime = Date.now();
        const requestId = crypto.randomUUID().slice(0, 8);
        const origin = request.headers.get('Origin');
        const host = request.headers.get('Host');

        // Check for local request
        const isLocalRequest = host?.includes('localhost') ||
            host?.includes('127.0.0.1') ||
            host === 'localhost:8787' ||
            host === '127.0.0.1:8787' ||
            host === 'localhost:4200' ||
            host === '127.0.0.1:4200';

        const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || isLocalRequest || origin === null;

        // Log request
        console.log(`[${requestId}] [CORS] Origin: ${origin}, Host: ${host}, isLocal: ${isLocalRequest}, Allowed: ${isAllowedOrigin}`);
        console.log(`[${requestId}] [REQUEST] ${method} ${url.pathname}${url.search}`);

        // Block unauthorized origins (except OPTIONS)
        if (!isAllowedOrigin && !isLocalRequest && origin !== null && method !== 'OPTIONS') {
            console.log(`[${requestId}] [CORS] BLOCKED - Origin not allowed: ${origin}`);
            return new Response(JSON.stringify({
                success: false,
                error: 'Unauthorized',
                message: 'Access from this origin is not allowed',
                requestId,
            }), {
                status: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin || '*',
                    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
                },
            });
        }

        // Dynamic CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': isAllowedOrigin && origin ? origin : '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
            'Access-Control-Max-Age': '86400',
            'X-Request-ID': requestId,
            'X-Response-Time': '0',
        };

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            console.log(`[${requestId}] [CORS] Preflight response sent`);
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // debug only - check secret API key
        // Public endpoints that don't require API key
        const publicEndpoints = ['/cache/health', '/cache/diagnostics', '/cache/status', '/cache/stats'];
        const isPublicEndpoint = publicEndpoints.some(endpoint => url.pathname === endpoint);

        // For non-public endpoints, check API key
        if (!isPublicEndpoint && method !== 'GET') {
            if (!isValidApiKey(request, env)) {
                console.log(`[${requestId}] [AUTH] Unauthorized - Invalid or missing API key`);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Valid X-API-Key header is required',
                    requestId,
                }), {
                    status: 401,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders,
                    },
                });
            }
            console.log(`[${requestId}] [AUTH] Authorized - Valid API key`);
        }

        try {
            let response;
            let responseTime;

            // Route handlers
            if (method === 'POST' && url.pathname === '/cache/images') {
                response = await handleBatchUpload(request, env, requestId);
            } else if (method === 'POST' && url.pathname === '/cache/image') {
                response = await handleSingleUpload(request, env, requestId);
            } else if (method === 'GET' && url.pathname.startsWith('/image/')) {
                response = await serveCachedImage(url, request, env, requestId);
            } else if (method === 'GET' && url.pathname === '/cache/status') {
                response = await checkCacheStatus(url, env, requestId);
            } else if (method === 'DELETE' && url.pathname === '/cache/images') {
                response = await clearOldCache(request, env, requestId);
            } else if (method === 'GET' && url.pathname === '/cache/stats') {
                response = await getCacheStats(env, requestId);
            } else if (method === 'GET' && url.pathname === '/cache/diagnostics') {
                response = await getDiagnostics(env, requestId);
            } else if (method === 'GET' && url.pathname === '/cache/list') {
                response = await listCachedImages(url, env, requestId);
            } else if (method === 'GET' && url.pathname === '/cache/image-info') {
                response = await getImageInfo(url, env, requestId);
            } else if (method === 'GET' && url.pathname === '/cache/health') {
                response = await getHealth(env, requestId);
            } else {
                response = new Response(JSON.stringify({ success: false, error: 'Not Found', requestId }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Add response time header
            responseTime = Date.now() - startTime;
            response.headers.set('X-Response-Time', `${responseTime}ms`);
            response.headers.set('X-Request-ID', requestId);

            // Add CORS headers
            for (const [key, value] of Object.entries(corsHeaders)) {
                if (!response.headers.has(key)) {
                    response.headers.set(key, value);
                }
            }

            console.log(`[${requestId}] [RESPONSE] ${response.status} in ${responseTime}ms`);
            return response;

        } catch (error) {
            console.error(`[${requestId}] [ERROR] ${error.message}`, error.stack);
            const errorResponse = new Response(JSON.stringify({
                success: false,
                error: error.message,
                requestId,
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });

            for (const [key, value] of Object.entries(corsHeaders)) {
                errorResponse.headers.set(key, value);
            }
            return errorResponse;
        }
    },
};

// Helper: Generate cache key from URL
function getCacheKey(imageUrl) {
    const encoder = new TextEncoder();
    const data = encoder.encode(imageUrl);
    return crypto.subtle.digest('MD5', data).then(hash => {
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const extension = getImageExtension(imageUrl);
        return `images/${hashHex}${extension}`;
    });
}

function getImageExtension(imageUrl) {
    const match = imageUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
    if (match) return `.${match[1].toLowerCase()}`;
    return '.jpg';
}

function getContentType(extension) {
    const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
    };
    return types[extension] || 'image/jpeg';
}

async function downloadImage(imageUrl, env, requestId) {
    console.log(`[${requestId}] [DOWNLOAD] Starting download: ${imageUrl.substring(0, 100)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        let fetchUrl = imageUrl;
        let headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': 'https://statusm.me/',
        };

        if (imageUrl.includes('statusm.me')) {
            // Try direct fetch first (works from Cloudflare Workers)
            console.log(`[${requestId}] [DOWNLOAD] Direct fetch for statusm.me (Cloudflare network)`);
            // No proxy needed - Cloudflare Workers have different network egress
        } else if (imageUrl.includes('supabase.co')) {
            console.log(`[${requestId}] [DOWNLOAD] Direct fetch for Supabase image`);
        }

        const downloadStart = Date.now();
        const response = await fetch(fetchUrl, { headers, signal: controller.signal });
        const downloadTime = Date.now() - downloadStart;

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.log(`[${requestId}] [DOWNLOAD] Failed: HTTP ${response.status} in ${downloadTime}ms`);
            throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        console.log(`[${requestId}] [DOWNLOAD] Content-Type: ${contentType}, Size: ${response.headers.get('content-length') || 'unknown'} bytes`);

        if (!SUPPORTED_FORMATS.some(f => contentType?.includes(f))) {
            throw new Error(`Unsupported content type: ${contentType}`);
        }

        const blob = await response.blob();
        if (blob.size > MAX_IMAGE_SIZE_BYTES) {
            throw new Error(`Image too large: ${(blob.size / 1024 / 1024).toFixed(2)}MB > ${MAX_IMAGE_SIZE_MB}MB`);
        }

        console.log(`[${requestId}] [DOWNLOAD] Success: ${blob.size} bytes in ${downloadTime}ms`);
        return {
            data: blob,
            contentType: contentType || 'image/jpeg',
            size: blob.size,
            downloadTime,
        };
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`[${requestId}] [DOWNLOAD] Error: ${error.message}`);
        throw error;
    }
}

/**
 * List cached images with pagination
 * GET /cache/list?limit=50&cursor=&prefix=
 */
async function listCachedImages(url, env, requestId) {
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const cursor = url.searchParams.get('cursor') || undefined;
    const prefix = url.searchParams.get('prefix') || 'images/';

    console.log(`[${requestId}] [LIST] Fetching images from R2: limit=${limit}, cursor=${cursor?.substring(0, 20)}...`);

    const bucket = env.MY_BUCKET;
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

/**
 * Get single image metadata by key
 * GET /cache/image-info?key=images/xxx.jpg
 */
async function getImageInfo(url, env, requestId) {
    const imageKey = url.searchParams.get('key');

    if (!imageKey) {
        return new Response(JSON.stringify({
            success: false,
            error: 'key parameter required',
            requestId
        }), { status: 400 });
    }

    console.log(`[${requestId}] [INFO] Getting metadata for: ${imageKey}`);

    const bucket = env.MY_BUCKET;

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

async function storeInR2(key, imageData, env, requestId) {
    console.log(`[${requestId}] [STORAGE] Storing to R2: ${key}`);
    const bucket = env.MY_BUCKET;
    const storeStart = Date.now();

    await bucket.put(key, imageData.data, {
        httpMetadata: { contentType: imageData.contentType },
        customMetadata: {
            originalSize: String(imageData.size),
            cachedAt: new Date().toISOString(),
            contentType: imageData.contentType,
        },
    });

    const storeTime = Date.now() - storeStart;
    console.log(`[${requestId}] [STORAGE] Stored ${imageData.size} bytes in ${storeTime}ms`);
    return key;
}

async function existsInCache(key, env, requestId) {
    const bucket = env.MY_BUCKET;
    const object = await bucket.head(key);
    const exists = object !== null;
    if (exists) {
        console.log(`[${requestId}] [CACHE] Hit: ${key}`);
    } else {
        console.log(`[${requestId}] [CACHE] Miss: ${key}`);
    }
    return exists;
}

async function handleBatchUpload(request, env, requestId) {
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

async function handleSingleUpload(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const { imageUrl, forceUpdate = false } = await request.json();
    console.log(`[${requestId}] [SINGLE] Processing: ${imageUrl?.substring(0, 100)}..., forceUpdate: ${forceUpdate}`);

    if (!imageUrl) {
        return new Response(JSON.stringify({ success: false, error: 'imageUrl required', requestId }), { status: 400 });
    }

    const startTime = Date.now();
    const key = await getCacheKey(imageUrl);

    if (!forceUpdate) {
        const exists = await existsInCache(key, env, requestId);
        if (exists) {
            return new Response(JSON.stringify({
                success: true,
                status: 'already_cached',
                key,
                requestId,
                timeMs: Date.now() - startTime,
            }), { status: 200 });
        }
    }

    const imageData = await downloadImage(imageUrl, env, requestId);
    await storeInR2(key, imageData, env, requestId);

    return new Response(JSON.stringify({
        success: true,
        status: 'cached',
        key,
        size: imageData.size,
        downloadTimeMs: imageData.downloadTime,
        totalTimeMs: Date.now() - startTime,
        requestId,
    }), { status: 200 });
}

async function serveCachedImage(url, request, env, requestId) {
    let imageKey = url.pathname.split('/image/')[1];

    if (!imageKey.startsWith('images/')) {
        imageKey = `images/${imageKey}`;
    }

    console.log(`[${requestId}] [SERVE] Requesting: ${imageKey}`);

    const bucket = env.MY_BUCKET;
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

async function checkCacheStatus(url, env, requestId) {
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

async function clearOldCache(request, env, requestId) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
    }

    const url = new URL(request.url);
    const olderThanDays = parseInt(url.searchParams.get('olderThanDays')) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    console.log(`[${requestId}] [CLEAN] Removing images older than ${olderThanDays} days (before ${cutoffDate.toISOString()})`);

    const bucket = env.MY_BUCKET;
    let deleted = 0;
    let cursor;
    const startTime = Date.now();

    do {
        const list = await bucket.list({ cursor, prefix: 'images/' });
        cursor = list.cursor;
        for (const object of list.objects) {
            if (object.uploaded < cutoffDate) {
                await bucket.delete(object.key);
                deleted++;
            }
        }
    } while (cursor);

    console.log(`[${requestId}] [CLEAN] Deleted ${deleted} images in ${Date.now() - startTime}ms`);
    return new Response(JSON.stringify({
        success: true,
        deleted,
        olderThanDays,
        timeMs: Date.now() - startTime,
        requestId,
    }), { status: 200 });
}

async function getCacheStats(env, requestId) {
    console.log(`[${requestId}] [STATS] Gathering cache statistics`);
    const bucket = env.MY_BUCKET;
    let totalObjects = 0;
    let totalSize = 0;
    let cursor;
    const startTime = Date.now();

    do {
        const list = await bucket.list({ cursor, prefix: 'images/' });
        cursor = list.cursor;
        totalObjects += list.objects.length;
        for (const object of list.objects) {
            totalSize += object.size;
        }
    } while (cursor);

    console.log(`[${requestId}] [STATS] Found ${totalObjects} objects, ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    return new Response(JSON.stringify({
        success: true,
        totalImages: totalObjects,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        bucket: R2_BUCKET_NAME,
        timeMs: Date.now() - startTime,
        requestId,
    }), { status: 200 });
}

async function getDiagnostics(env, requestId) {
    console.log(`[${requestId}] [DIAGNOSTICS] Running diagnostic checks`);
    const diagnostics = {
        success: true,
        worker: {
            name: 'image-cache-worker',
            version: '1.0.0',
            environment: env.ENVIRONMENT || 'production',
            requestId,
        },
        r2: {
            bucketName: R2_BUCKET_NAME,
            bucketExists: false,
            bucketAccessible: false,
            error: null,
        },
        config: {
            maxImageSizeMB: MAX_IMAGE_SIZE_MB,
            cacheTTLDays: CACHE_TTL_SECONDS / 86400,
            supportedFormats: SUPPORTED_FORMATS,
        },
        timestamp: new Date().toISOString(),
    };

    // Test R2 bucket access
    try {
        const bucket = env.MY_BUCKET;
        const testKey = 'diagnostics/test.txt';
        await bucket.put(testKey, 'test');
        const testObj = await bucket.get(testKey);
        diagnostics.r2.bucketExists = true;
        diagnostics.r2.bucketAccessible = testObj !== null;
        await bucket.delete(testKey);
    } catch (error) {
        diagnostics.r2.error = error.message;
        diagnostics.success = false;
    }

    console.log(`[${requestId}] [DIAGNOSTICS] R2 accessible: ${diagnostics.r2.bucketAccessible}`);
    return new Response(JSON.stringify(diagnostics, null, 2), { status: 200 });
}

async function getHealth(env, requestId) {
    return new Response(JSON.stringify({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        requestId,
    }), { status: 200 });
}