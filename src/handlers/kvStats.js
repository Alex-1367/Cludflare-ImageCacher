// ./handlers/kvStats.js

export async function handleKvStats(env, requestId) {
    try {
        const listed = await env.IMAGE_MAPPINGS.list({ prefix: 'url:' });

        let totalSize = 0;
        for (const key of listed.keys) {
            const mapping = await env.IMAGE_MAPPINGS.get(key.name, 'json');
            if (mapping && mapping.size) {
                totalSize += mapping.size;
            }
        }

        return new Response(JSON.stringify({
            success: true,
            totalMappings: listed.keys.length,
            totalSizeBytes: totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
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