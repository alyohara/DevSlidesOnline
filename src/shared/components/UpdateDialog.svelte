<script lang="ts">
  /**
   * Update dialog — shown when a newer release exists (from the Help menu
   * or the silent startup probe). Offers a direct link to the release.
   */
  import { Download, X } from "@lucide/svelte";
  import { ui, setIsUpdateOpen } from "$lib/stores/ui-state.svelte";
  import { api } from "$lib/lib/tauri-api";
  import Button from "$lib/ui/Button.svelte";
  import Kbd from "$lib/ui/Kbd.svelte";
  import Overlay, { Z_INDEX } from "$lib/ui/Overlay.svelte";
  import { focusTrap } from "$lib/actions/focus-trap";
  import {
    checkForUpdatesSilently,
    updateCheckSupported,
  } from "$lib/updates/update-check";

  let info = $derived(ui.updateInfo);

  $effect(() => {
    if (updateCheckSupported()) {
      const timer = window.setTimeout(() => {
        void checkForUpdatesSilently();
      }, 4000);
      return () => window.clearTimeout(timer);
    }
  });
</script>

{#if info}
  <Overlay
    onClose={() => setIsUpdateOpen(false)}
    z={Z_INDEX.update}
    closeOnEsc
    class="w-full max-w-lg"
  >
    <div
      use:focusTrap
      class="overflow-hidden rounded-xl border bg-card shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 id="update-title" class="text-sm font-semibold">
          Update available
        </h2>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={() => setIsUpdateOpen(false)}
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="space-y-4 p-5">
        <div class="flex items-center gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Download class="h-6 w-6" />
          </div>
          <div>
            <div class="text-base font-semibold">
              DevSlides {info.latestVersion} is here
            </div>
            <div class="text-xs text-muted-foreground">
              You're on {info.currentVersion}.
            </div>
          </div>
        </div>

        {#if info.releaseNotes}
          <div
            class="max-h-40 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground"
          >
            {info.releaseNotes}
          </div>
        {/if}

        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            class="gap-1.5"
            onclick={() => {
              const url = info.releaseUrl;
              if (url) void api.openUrl(url).catch(() => {});
            }}
          >
            <Download class="h-3.5 w-3.5" />Open release &amp; download
          </Button>
          <Button
            size="sm"
            variant="outline"
            onclick={() => setIsUpdateOpen(false)}
          >
            Not now
          </Button>
        </div>
      </div>

      <div class="border-t px-4 py-2 text-[10px] text-muted-foreground">
        Press <Kbd>Esc</Kbd> to close
      </div>
    </div>
  </Overlay>
{/if}
