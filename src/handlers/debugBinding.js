// ./handlers/debugBinding.js

import { getCorsHeaders, isAllowedOrigin, isLocalRequest } from '../utils/cors.js';

export async function handleDebugBinding(request, env, requestId) {
    const origin = request.headers.get('Origin');
    const host = request.headers.get('Host');
    const isLocal = isLocalRequest(host);
    const allowedOrigin = isAllowedOrigin(origin, host);
    const corsHeaders = getCorsHeaders(origin, allowedOrigin);
    
    const bindings = {
        hasKV: typeof env.IMAGE_MAPPINGS !== 'undefined',
        hasR2: typeof env.R2_BUCKET !== 'undefined',
        hasAPIKey: typeof env.API_KEY !== 'undefined',
        kvType: typeof env.IMAGE_MAPPINGS,
        r2Type: typeof env.R2_BUCKET,
        kvBindingName: env.IMAGE_MAPPINGS?.constructor?.name || 'not bound',
        r2BindingName: env.R2_BUCKET?.constructor?.name || 'not bound',
    };
    
    return new Response(JSON.stringify(bindings, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}