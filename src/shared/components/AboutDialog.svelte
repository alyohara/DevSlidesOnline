<script lang="ts">
  /**
   * About dialog — app name/version (fetched from the server so it stays in
   * sync with the released version) plus external links.
   */
  import { Bug, ExternalLink, X } from "@lucide/svelte";
  import { ui, setIsAboutOpen } from "$lib/stores/ui-state.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Kbd from "$lib/ui/Kbd.svelte";
  import Overlay, { Z_INDEX } from "$lib/ui/Overlay.svelte";
  import { focusTrap } from "$lib/actions/focus-trap";
  import { api, type AppInfo } from "$lib/lib/tauri-api";
  import { APP_ISSUES_URL, APP_REPOSITORY_URL } from "$lib/lib/app-info";

  let info = $state<AppInfo | null>(null);

  $effect(() => {
    if (ui.isAboutOpen && !info) {
      void api
        .getAppInfo()
        .then((app) => (info = app))
        .catch(() => (info = null));
    }
  });
</script>

{#if ui.isAboutOpen}
  <Overlay
    onClose={() => setIsAboutOpen(false)}
    z={Z_INDEX.about}
    closeOnEsc
    class="w-full max-w-md"
  >
    <div
      use:focusTrap
      class="overflow-hidden rounded-xl border bg-card shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 id="about-title" class="text-sm font-semibold">About DevSlides</h2>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={() => setIsAboutOpen(false)}
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="space-y-4 p-5">
        <div class="flex items-center gap-3">
          <img
            src="/devslides-logo.svg"
            alt="DevSlides logo"
            class="h-12 w-12 rounded-lg object-cover"
          />
          <div>
            <div class="text-base font-semibold">
              {info?.name ?? "DevSlides"}
            </div>
            <div class="text-xs text-muted-foreground">
              {info ? `Version ${info.version}` : ""}
            </div>
          </div>
        </div>

        <p class="text-sm text-muted-foreground">
          {info?.description ??
            "Offline-first code presentation desktop app (a fork of OpenSlides)."}
        </p>

        <div
          class="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          DevSlides is an open-source fork of OpenSlides.
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            class="gap-1.5"
            onclick={() =>
              void api
                .openUrl(info?.repository ?? APP_REPOSITORY_URL)
                .catch(() => {})}
          >
            <ExternalLink class="h-3.5 w-3.5" />Open repository
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="gap-1.5"
            onclick={() => void api.openUrl(APP_ISSUES_URL).catch(() => {})}
          >
            <Bug class="h-3.5 w-3.5" />Report an issue
          </Button>
        </div>
      </div>

      <div class="border-t px-4 py-2 text-[10px] text-muted-foreground">
        Press <Kbd>Esc</Kbd> to close
      </div>
    </div>
  </Overlay>
{/if}
