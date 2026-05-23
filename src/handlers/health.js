// ./handlers/health.js

export async function handleHealth(env, requestId) {
    return new Response(JSON.stringify({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        requestId,
    }), { status: 200 });
}