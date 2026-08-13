// Single source of truth for consent copy + policy versions, so the text
// recorded in sms_consent_events always matches exactly what the frontend
// displayed (section 6.2, 14.3) -- the frontend fetches this rather than
// hardcoding its own copy of the disclosure.

export const PRIVACY_POLICY_VERSION = '2026-08-13';
export const TERMS_VERSION = '2026-08-13';
export const OPERATIONAL_CONSENT_TEXT_VERSION = 'v1';

export const OPERATIONAL_CONSENT_TEXT =
  'Send me GroveIQ SMS/MMS notifications. By checking this box, I agree to receive recurring and event-driven text messages from GroveIQ at the mobile number provided, including plant health, sensor, irrigation, environmental/weather, security, and account alerts that I enable. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase or use of GroveIQ. See Terms and Privacy Policy.';

export const CATEGORY_LABELS: Record<string, { label: string; example: string }> = {
  plant_health: { label: 'Plant health alerts', example: 'Stress, disease risk, care threshold' },
  sensor: { label: 'Sensor alerts', example: 'Device readings outside configured range' },
  irrigation: { label: 'Irrigation alerts', example: 'Watering started, completed, failed, leak risk' },
  environment_weather: { label: 'Environment & weather alerts', example: 'Frost, heat, humidity, severe weather' },
  security: { label: 'Security alerts', example: 'Suspicious login or security event' },
  account_service: { label: 'Account & service notices', example: 'Critical account/device service events' },
};
