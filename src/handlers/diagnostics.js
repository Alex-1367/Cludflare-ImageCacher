// ./handlers/diagnostics.js

import { R2_BUCKET_NAME, MAX_IMAGE_SIZE_MB, CACHE_TTL_SECONDS, SUPPORTED_FORMATS } from '../utils/constants.js';

export async function handleDiagnostics(env, requestId) {
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
        const bucket = env.R2_BUCKET;
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
