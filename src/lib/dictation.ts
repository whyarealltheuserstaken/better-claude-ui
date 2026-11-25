/** Voice dictation through the browser speech API, when the webview provides it. */

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type Ctor = new () => RecognitionLike;

function ctor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dictationSupported = (): boolean => ctor() !== null;

/** Join the text typed before dictation with what was dictated, with one space between. */
export function mergeTranscript(base: string, finalText: string, interim: string): string {
  const spoken = `${finalText}${interim}`.replace(/\s+/g, " ").trim();
  if (!spoken) return base;
  if (!base) return spoken;
  return /\s$/.test(base) ? base + spoken : `${base} ${spoken}`;
}

/** Plain-language message for a speech error code. */
export function dictationError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Dictation was blocked. Allow microphone access for this app in your system settings, then try again.";
    case "no-speech":
      return "Didn't hear anything. Try again, a little closer to the microphone.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Dictation needs an internet connection on this computer.";
    case "aborted":
      return "";
    default:
      return "Dictation isn't available right now.";
  }
}

export interface Dictation {
  start(): void;
  stop(): void;
}

/** Create a dictation controller. `onText(final, interim)` receives the running transcript. */
export function createDictation(opts: {
  lang?: string;
  onText: (finalText: string, interim: string) => void;
  onState: (listening: boolean) => void;
  onError: (message: string) => void;
}): Dictation | null {
  const C = ctor();
  if (!C) return null;
  let rec: RecognitionLike | null = null;
  let finalText = "";
  return {
    start() {
      if (rec) return;
      rec = new C();
      rec.lang = opts.lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
      rec.continuous = true;
      rec.interimResults = true;
      finalText = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        opts.onText(finalText, interim);
      };
      rec.onerror = (e) => {
        const m = dictationError(e.error);
        if (m) opts.onError(m);
      };
      rec.onend = () => {
        rec = null;
        opts.onState(false);
      };
      try {
        rec.start();
        opts.onState(true);
      } catch {
        rec = null;
        opts.onError(dictationError("other"));
      }
    },
    stop() {
      rec?.stop();
    },
  };
}
