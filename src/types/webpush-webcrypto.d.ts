// webpush-webcrypto ships no TypeScript declarations (plain JS + JSDoc).
// Minimal ambient types covering only what push.ts actually uses --
// verified against node_modules/webpush-webcrypto/lib/*.js source.
declare module 'webpush-webcrypto' {
  export type ApplicationServerKeysJSON = {
    publicKey: string;
    privateKey: string;
  };

  export class ApplicationServerKeys {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    toJSON(): Promise<ApplicationServerKeysJSON>;
    static fromJSON(keys: ApplicationServerKeysJSON): Promise<ApplicationServerKeys>;
    static generate(): Promise<ApplicationServerKeys>;
  }

  export type PushTarget = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  export type PushOptions = {
    payload: string | Uint8Array;
    applicationServerKeys: ApplicationServerKeys;
    target: PushTarget;
    adminContact: string;
    ttl: number;
    topic?: string;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
  };

  export function generatePushHTTPRequest(options: PushOptions): Promise<{
    headers: Record<string, string>;
    body: ArrayBuffer;
    endpoint: string;
  }>;

  export function setWebCrypto(crypto: Crypto): void;
}
