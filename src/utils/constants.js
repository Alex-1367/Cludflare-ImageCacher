// ./utils/constants.js

export const R2_BUCKET_NAME = 'r2prus';
export const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const MAX_IMAGE_SIZE_MB = 20;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const SUPPORTED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];