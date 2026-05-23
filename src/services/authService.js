// ./services/authService.js

export function isValidApiKey(request, env) {
    const providedKey = request.headers.get('X-API-Key');
    const expectedKey = env.API_KEY;

    // Debug - show exact values
    /*
    console.log(`[AUTH] Provided RAW: "${providedKey}"`);
    console.log(`[AUTH] Expected RAW: "${expectedKey}"`);
    console.log(`[AUTH] Provided length: ${providedKey?.length}`);
    console.log(`[AUTH] Expected length: ${expectedKey?.length}`);
    console.log(`[AUTH] Strict equals: ${providedKey === expectedKey}`);
    */
    if (!expectedKey || !providedKey) {
        return false;
    }
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