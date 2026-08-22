import { describe, it, expect } from "vitest";
import {
  createAuth,
  PopupBlockedError,
  DRIVE_SCOPE,
  type TokenClientFactory,
  type TokenResponse,
} from "./googleAuth";

type Callback = (r: TokenResponse) => void;
type ErrorCallback = (e: { type: string }) => void;

/** Builds a factory whose requestAccessToken resolves or fails on demand. */
function factoryThat(behaviour: (cb: Callback, errCb: ErrorCallback, prompt: string) => void) {
  const calls: string[] = [];
  const factory: TokenClientFactory = (cfg) => ({
    requestAccessToken({ prompt }) {
      calls.push(prompt);
      behaviour(cfg.callback, cfg.error_callback, prompt);
    },
  });
  return { factory, calls };
}

const ok = (token: string) => factoryThat((cb) => cb({ access_token: token, expires_in: 3600 }));

describe("createAuth", () => {
  it("requests the drive.file scope", async () => {
    const seen: string[] = [];
    const factory: TokenClientFactory = (cfg) => {
      seen.push(cfg.scope);
      return {
        requestAccessToken: () => cfg.callback({ access_token: "t", expires_in: 3600 }),
      };
    };
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    expect(seen).toEqual([DRIVE_SCOPE]);
  });

  it("passes the client id through to the token client", async () => {
    const seen: string[] = [];
    const factory: TokenClientFactory = (cfg) => {
      seen.push(cfg.client_id);
      return {
        requestAccessToken: () => cfg.callback({ access_token: "t", expires_in: 3600 }),
      };
    };
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    expect(seen).toEqual(["cid"]);
  });

  it("returns null before any token is granted", () => {
    const auth = createAuth({ clientId: "cid", tokenClientFactory: ok("t").factory });
    expect(auth.getToken()).toBeNull();
  });

  it("caches the token after a successful request", async () => {
    const auth = createAuth({ clientId: "cid", tokenClientFactory: ok("tok-1").factory });
    expect(await auth.requestToken()).toBe("tok-1");
    expect(auth.getToken()).toBe("tok-1");
  });

  it("uses an empty prompt when silent", async () => {
    const { factory, calls } = ok("t");
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken({ silent: true });
    expect(calls).toEqual([""]);
  });

  it("uses the consent prompt when not silent", async () => {
    const { factory, calls } = ok("t");
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    expect(calls).toEqual(["consent"]);
  });

  it("collapses concurrent requests into a single popup", async () => {
    const { factory, calls } = ok("t");
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    const [a, b] = await Promise.all([auth.requestToken(), auth.requestToken()]);
    expect(calls).toHaveLength(1);
    expect([a, b]).toEqual(["t", "t"]);
  });

  it("allows a fresh request once the previous one has settled", async () => {
    const { factory, calls } = ok("t");
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    await auth.requestToken();
    expect(calls).toHaveLength(2);
  });

  it("rejects with PopupBlockedError when the popup fails to open", async () => {
    const { factory } = factoryThat((_cb, errCb) => errCb({ type: "popup_failed_to_open" }));
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await expect(auth.requestToken()).rejects.toBeInstanceOf(PopupBlockedError);
  });

  it("rejects when the token response carries an error", async () => {
    const { factory } = factoryThat((cb) => cb({ error: "access_denied" }));
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await expect(auth.requestToken({ silent: true })).rejects.toThrow(/access_denied/);
  });

  it("leaves the cached token untouched when a refresh fails", async () => {
    let fail = false;
    const factory: TokenClientFactory = (cfg) => ({
      requestAccessToken: () =>
        fail ? cfg.callback({ error: "access_denied" }) : cfg.callback({ access_token: "tok-1" }),
    });
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    fail = true;
    await expect(auth.requestToken({ silent: true })).rejects.toThrow();
    expect(auth.getToken()).toBe("tok-1");
  });

  it("signOut discards the cached token", async () => {
    const auth = createAuth({ clientId: "cid", tokenClientFactory: ok("t").factory });
    await auth.requestToken();
    auth.signOut();
    expect(auth.getToken()).toBeNull();
  });
});
