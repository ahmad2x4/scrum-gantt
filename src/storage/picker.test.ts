import { describe, it, expect, vi } from "vitest";
import { openPicker, type PickerBuilder } from "./picker";

describe("openPicker", () => {
  it("resolves with the picked file", async () => {
    const build: PickerBuilder = (cfg) => ({
      setVisible: () => cfg.onPicked({ id: "f1", name: "Shared plan" }),
    });
    await expect(
      openPicker({ apiKey: "k", token: "t", buildPicker: build }),
    ).resolves.toEqual({
      id: "f1",
      name: "Shared plan",
    });
  });

  it("resolves null when the user cancels", async () => {
    const build: PickerBuilder = (cfg) => ({
      setVisible: () => cfg.onPicked(null),
    });
    await expect(
      openPicker({ apiKey: "k", token: "t", buildPicker: build }),
    ).resolves.toBeNull();
  });

  it("passes the api key and token through to the builder", async () => {
    const seen: Array<{ apiKey: string; token: string }> = [];
    const build: PickerBuilder = (cfg) => {
      seen.push({ apiKey: cfg.apiKey, token: cfg.token });
      return { setVisible: () => cfg.onPicked(null) };
    };
    await openPicker({ apiKey: "key-1", token: "tok-1", buildPicker: build });
    expect(seen).toEqual([{ apiKey: "key-1", token: "tok-1" }]);
  });

  it("makes the picker visible exactly once", async () => {
    const setVisible = vi.fn();
    const build: PickerBuilder = (cfg) => {
      queueMicrotask(() => cfg.onPicked(null));
      return { setVisible };
    };
    await openPicker({ apiKey: "k", token: "t", buildPicker: build });
    expect(setVisible).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("ignores callbacks after the first", async () => {
    let notify: (f: { id: string; name: string } | null) => void = () => {};
    const build: PickerBuilder = (cfg) => {
      notify = cfg.onPicked;
      return { setVisible: () => cfg.onPicked({ id: "f1", name: "first" }) };
    };
    const picked = await openPicker({
      apiKey: "k",
      token: "t",
      buildPicker: build,
    });
    notify(null);
    expect(picked).toEqual({ id: "f1", name: "first" });
  });
});
