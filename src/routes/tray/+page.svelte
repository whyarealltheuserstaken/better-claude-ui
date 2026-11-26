<script lang="ts">
  import { onMount } from "svelte";
  import TrayPanel from "$lib/components/TrayPanel.svelte";
  import { hideThisWindow, onTrayView, sendTrayAction } from "$lib/ipc";
  import { type TrayAction, type TrayView, parseTrayView } from "$lib/trayBridge";

  let view = $state<TrayView | null>(null);

  onMount(() => {
    let stop: (() => void) | undefined;
    // Listen first, so the answer to "ready" cannot arrive before anyone hears it.
    void onTrayView((raw) => (view = parseTrayView(raw) ?? view)).then((unlisten) => {
      stop = unlisten;
      void sendTrayAction({ type: "ready" });
    });
    return () => stop?.();
  });

  $effect(() => {
    if (!view) return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(view.vars)) root.style.setProperty(name, value);
    root.dataset.scheme = view.vars["color-scheme"] ?? "dark";
  });

  function act(action: TrayAction) {
    // Show a settings change at once; the main window saves it and sends the view back.
    if (action.type === "settings" && view) view = { ...view, settings: action.value };
    void sendTrayAction(action);
  }
</script>

<svelte:head><title>BetterClaudeUI</title></svelte:head>

<TrayPanel {view} onaction={act} onhide={() => void hideThisWindow()} />
