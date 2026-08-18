export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  IRRIGATION_DEVICE_KEY: string;
  CAMERA_DEVICE_KEY?: string;
  ECOWITT_APPLICATION_KEY?: string;
  ECOWITT_API_KEY?: string;
  ECOWITT_MAC?: string;
  ANTHROPIC_API_KEY?: string;
  AIRNOW_API_KEY?: string;
  PURPLEAIR_API_KEY?: string;
  NASA_FIRMS_MAP_KEY?: string;
  RESEND_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_API_KEY_SID?: string;
  TWILIO_API_KEY_SECRET?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  ALERT_EMAIL_TO?: string;
  ALERT_SMS_TO?: string;
  PHONE_ENCRYPTION_KEY?: string;
  PHONE_HASH_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}
