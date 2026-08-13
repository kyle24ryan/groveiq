export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  IRRIGATION_DEVICE_KEY: string;
  ECOWITT_APPLICATION_KEY?: string;
  ECOWITT_API_KEY?: string;
  ECOWITT_MAC?: string;
  ANTHROPIC_API_KEY?: string;
  AIRNOW_API_KEY?: string;
}
