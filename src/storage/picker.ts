export interface PickedFile {
  id: string;
  name: string;
}

export type PickerBuilder = (cfg: {
  apiKey: string;
  token: string;
  onPicked(f: PickedFile | null): void;
}) => { setVisible(v: boolean): void };

/**
 * The `drive.file` scope only sees files this app created, so a plan shared by
 * a colleague is invisible to the Drive API until the user selects it here.
 * Picking a file grants this app access to that one file.
 */

interface GapiWindow {
  gapi?: { load(module: string, cb: () => void): void };
}

let loading: Promise<void> | null = null;

/** Loads Google's picker module. Idempotent. */
export function loadPickerApi(loader?: () => Promise<void>): Promise<void> {
  if (loader) return loader();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const g = (window as unknown as GapiWindow).gapi;
    if (g) {
      g.load("picker", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      const loaded = (window as unknown as GapiWindow).gapi;
      if (!loaded) {
        reject(new Error("Could not load the Google Picker."));
        return;
      }
      loaded.load("picker", () => resolve());
    };
    script.onerror = () =>
      reject(new Error("Could not load the Google Picker."));
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    // A failed load must not poison every later attempt.
    loading = null;
    throw e;
  });

  return loading;
}

// Google's picker API ships no type definitions, so this builder is the one
// place the app talks to it untyped.
const defaultBuilder: PickerBuilder = ({ apiKey, token, onPicked }) => {
  const google = (window as unknown as { google: any }).google;
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setMimeTypes("application/json")
    .setIncludeFolders(true);

  return new google.picker.PickerBuilder()
    .setDeveloperKey(apiKey)
    .setOAuthToken(token)
    .addView(view)
    .setCallback((data: any) => {
      const action = data[google.picker.Response.ACTION];
      if (action === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        onPicked({ id: doc.id, name: doc.name });
      } else if (action === google.picker.Action.CANCEL) {
        onPicked(null);
      }
    })
    .build();
};

export function openPicker(deps: {
  apiKey: string;
  token: string;
  buildPicker?: PickerBuilder;
}): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    let settled = false;
    const picker = (deps.buildPicker ?? defaultBuilder)({
      apiKey: deps.apiKey,
      token: deps.token,
      onPicked: (f) => {
        // The picker fires CANCEL after PICKED in some flows; first wins.
        if (settled) return;
        settled = true;
        resolve(f);
      },
    });
    picker.setVisible(true);
  });
}
