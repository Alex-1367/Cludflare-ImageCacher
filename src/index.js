/*
/cache/health	        GET	    Health check
/cache/diagnostics	    GET	    Worker diagnostics
/cache/stats	        GET	    R2 cache statistics
/cache/list	            GET	    List cached images (paginated)
/cache/image-info	    GET	    Get image metadata by key
/cache/status	        GET	    Check if URL is cached
/cache/image	        POST	Upload single image with property ID
/cache/images	        POST	Batch upload images
/cache/property-images	POST	Upload all images for a property
/cache/property-images	GET	    Get all images for a property
/cache/property-images	DELETE	Delete all images for a property (when sold)
/cache/upload-file	    POST	Upload local file
/cache/mappings	        GET	    List all URL-to-key mappings
/cache/mapping	        GET	    Get mapping for specific URL
/cache/mapping	        DELETE	Delete mapping and cached image
/cache/kv-stats	        GET	    KV storage statistics
/image/{key}	        GET	    Serve cached image
*/

import { R2_BUCKET_NAME, CACHE_TTL_SECONDS, MAX_IMAGE_SIZE_MB, MAX_IMAGE_SIZE_BYTES, SUPPORTED_FORMATS } from './utils/constants.js';
import { ALLOWED_ORIGINS, getCorsHeaders, isLocalRequest, isAllowedOrigin } from './utils/cors.js';
import { isValidApiKey } from './services/authService.js';

// Import all handlers
import { deleteSingleImage } from './services/kvService.js';
import { handleHealth } from './handlers/health.js';
import { handleDiagnostics } from './handlers/diagnostics.js';
import { handleCacheStats } from './handlers/cacheStats.js';
import { handleCacheList } from './handlers/cacheList.js';
import { handleImageInfo } from './handlers/imageInfo.js';
import { handleCacheStatus } from './handlers/cacheStatus.js';
import { handleSingleUpload } from './handlers/singleUpload.js';
import { handleBatchUpload } from './handlers/batchUpload.js';
import { handlePropertyBatchUpload, handleGetPropertyImages, handleDeletePropertyImages } from './handlers/propertyImages.js';
import { handleFileUpload } from './handlers/fileUpload.js';
import { handleServeImage } from './handlers/serveImage.js';
import { handleClearOldCache, handleDeleteImage } from './handlers/clearCache.js';
import { handleListUrlMappings, handleGetUrlMapping, handleDeleteUrlMapping } from './handlers/kvMappings.js';
import { handleKvStats } from './handlers/kvStats.js';

// Public endpoints that don't require API key
const PUBLIC_ENDPOINTS = ['/cache/health', '/cache/diagnostics', '/cache/status', '/cache/stats'];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;
        const startTime = Date.now();
        const requestId = crypto.randomUUID().slice(0, 8);
        const origin = request.headers.get('Origin');
        const host = request.headers.get('Host');

        // CORS check
        const isLocal = isLocalRequest(host);
        const allowedOrigin = isAllowedOrigin(origin, host);

        console.log(`[${requestId}] [REQUEST] ${method} ${url.pathname}`);

        // Block unauthorized origins
        if (!allowedOrigin && !isLocal && origin !== null && method !== 'OPTIONS') {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 403 });
        }

        const corsHeaders = getCorsHeaders(origin, allowedOrigin);

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // API Key check for non-public endpoints
        const isPublicEndpoint = PUBLIC_ENDPOINTS.some(e => url.pathname === e);
        if (!isPublicEndpoint && method !== 'GET') {
            if (!isValidApiKey(request, env)) {
                return new Response(JSON.stringify({ success: false, error: 'Unauthorized', requestId }), { status: 401 });
            }
        }

        try {
            let response;

            // Route handlers
           const routes = {
                'POST:/cache/images': () => handleBatchUpload(request, env, requestId),
                'POST:/cache/image': () => handleSingleUpload(request, env, requestId),
                'POST:/cache/property-images': () => handlePropertyBatchUpload(request, env, requestId),
                'POST:/cache/upload-file': () => handleFileUpload(request, env, requestId),
                'GET:/cache/health': () => handleHealth(env, requestId),
                'GET:/cache/diagnostics': () => handleDiagnostics(env, requestId),
                'GET:/cache/stats': () => handleCacheStats(env, requestId),
                'GET:/cache/list': () => handleCacheList(url, env, requestId),
                'GET:/cache/image-info': () => handleImageInfo(url, env, requestId),
                'GET:/cache/status': () => handleCacheStatus(url, env, requestId),
                'GET:/cache/mappings': () => handleListUrlMappings(url, env, requestId),
                'GET:/cache/mapping': () => handleGetUrlMapping(url, env, requestId),
                'DELETE:/cache/mapping': () => handleDeleteUrlMapping(request, env, requestId),
                'GET:/cache/kv-stats': () => handleKvStats(env, requestId),
                'DELETE:/cache/images': () => handleClearOldCache(request, env, requestId),
                'GET:/cache/property-images': () => handleGetPropertyImages(url, env, requestId),
                'DELETE:/cache/property-images': () => handleDeletePropertyImages(url, env, requestId),
                'DELETE:/cache/image': () => handleDeleteImage(url, env, requestId),  
            };

            const routeKey = `${method}:${url.pathname}`;
            const handler = routes[routeKey];

            if (handler) {
                response = await handler();
            } else if (method === 'GET' && url.pathname.startsWith('/image/')) {
                response = await handleServeImage(url, request, env, requestId);
            } else {
                response = new Response(JSON.stringify({ success: false, error: 'Not Found', requestId }), { status: 404 });
            }

            response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
            response.headers.set('X-Request-ID', requestId);
            for (const [key, value] of Object.entries(corsHeaders)) {
                if (!response.headers.has(key)) response.headers.set(key, value);
            }

            return response;
        } catch (error) {
            console.error(`[${requestId}] [ERROR] ${error.message}`);
            return new Response(JSON.stringify({ success: false, error: error.message, requestId }), { status: 500 });
        }
    }
}









