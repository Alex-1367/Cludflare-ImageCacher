// ./services/downloadImage.js

import { SUPPORTED_FORMATS, MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MB } from '../utils/constants.js';

export async function downloadImage(imageUrl, env, requestId) {
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