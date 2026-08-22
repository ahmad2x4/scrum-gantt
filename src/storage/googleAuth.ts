export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export class PopupBlockedError extends Error {
  constructor() {
    super("The sign-in popup was blocked by the browser.");
    this.name = "PopupBlockedError";
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in to Google.");
    this.name = "NotSignedInError";
  }
}

export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

export interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (r: TokenResponse) => void;
  error_callback: (e: { type: string }) => void;
}

export interface TokenClient {
  requestAccessToken(o: { prompt: string }): void;
}

export type TokenClientFactory = (cfg: TokenClientConfig) => TokenClient;

export interface GoogleAuth {
  getToken(): string | null;
  requestToken(opts?: { silent?: boolean }): Promise<string>;
  signOut(): void;
}

/** The shape of the Google Identity Services script loaded by index.html. */
interface GisWindow {
  google?: {
    accounts?: {
      oauth2?: { initTokenClient(cfg: TokenClientConfig): TokenClient };
    };
  };
}

export const defaultTokenClientFactory: TokenClientFactory = (cfg) => {
  const oauth2 = (window as unknown as GisWindow).google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity Services has not loaded.");
  }
  return oauth2.initTokenClient(cfg);
};

export function createAuth(deps: {
  clientId: string;
  tokenClientFactory: TokenClientFactory;
}): GoogleAuth {
  let token: string | null = null;
  let pending: Promise<string> | null = null;

  const request = (silent: boolean) =>
    new Promise<string>((resolve, reject) => {
      const client = deps.tokenClientFactory({
        client_id: deps.clientId,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) {
            reject(new Error(r.error ?? "No access token returned."));
            return;
          }
          token = r.access_token;
          resolve(token);
        },
        error_callback: (e) => {
          reject(
            e.type === "popup_failed_to_open" || e.type === "popup_closed"
              ? new PopupBlockedError()
              : new Error(e.type),
          );
        },
      });
      client.requestAccessToken({ prompt: silent ? "" : "consent" });
    });

  return {
    getToken: () => token,

    requestToken(opts) {
      // Collapse concurrent refreshes so one 401 storm yields one popup.
      if (pending) return pending;
      pending = request(opts?.silent ?? false).finally(() => {
        pending = null;
      });
      return pending;
    },

    signOut() {
      token = null;
    },
  };
}
