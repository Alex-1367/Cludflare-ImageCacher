// ./utils/cors.js

export const ALLOWED_ORIGINS = [
    'https://admin.imbcargo-montenegro.com',
    'https://wwww.imbcargo-montenegro.com',
    'https://imbcargo-montenegro.com',
    'http://localhost:4200',
    'http://localhost:8787',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:8787',
    'https://prus-api2.burgas275.workers.dev',
];

export function getCorsHeaders(origin, isAllowedOrigin) {
    return {
        'Access-Control-Allow-Origin': isAllowedOrigin && origin ? origin : '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        'Access-Control-Max-Age': '86400',
    };
}

export function isLocalRequest(host) {
    return host?.includes('localhost') ||
        host?.includes('127.0.0.1') ||
        host === 'localhost:8787' ||
        host === '127.0.0.1:8787' ||
        host === 'localhost:4200' ||
        host === '127.0.0.1:4200';
}

export function isAllowedOrigin(origin, host) {
    return ALLOWED_ORIGINS.includes(origin) || isLocalRequest(host) || origin === null;
}