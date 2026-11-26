<!-- The soft colour behind the glass. It turns to the waiting colour while Claude waits for permission. -->
<script lang="ts">
  let { waiting }: { waiting: boolean } = $props();
</script>

<div class="backdrop" aria-hidden="true">
  <div class="calm"></div>
  <div class="wait" class:on={waiting}></div>
</div>

<style>
  .backdrop, .backdrop div { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
  .backdrop { background: var(--bg); }
  .calm {
    background:
      radial-gradient(70vw 70vh at 10% 0%, var(--glow-a), transparent 70%),
      radial-gradient(75vw 75vh at 90% 100%, var(--glow-b), transparent 70%),
      radial-gradient(55vw 60vh at 82% 6%, var(--glow-c), transparent 70%);
  }
  .wait {
    opacity: 0;
    transition: opacity 0.4s ease;
    background:
      radial-gradient(60vw 60vh at 8% 0%, var(--wait-a), transparent 72%),
      radial-gradient(75vw 75vh at 90% 100%, var(--wait-a), var(--bg) 75%),
      radial-gradient(55vw 60vh at 82% 6%, var(--wait-b), transparent 70%);
  }
  .wait.on { opacity: 1; }
  :global(:root[data-solid="true"]) .calm, :global(:root[data-solid="true"]) .wait { display: none; }
  @media (prefers-reduced-motion: reduce) { .wait { transition: none; } }
  @media (forced-colors: active) { .backdrop { display: none; } }
</style>
