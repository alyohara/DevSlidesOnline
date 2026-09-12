<script lang="ts">
  /**
   * App shell — auth gate + hash router + global toast viewport.
   *
   * While the session is unknown a minimal splash is shown (no flash of the
   * dashboard); guests get the sign-in page regardless of the current hash,
   * so a deep link like #/editor/… resumes after login.
   */
  import Router from "svelte-spa-router";
  import AppToaster from "$lib/ui/AppToaster.svelte";
  import UpdateDialog from "$lib/components/UpdateDialog.svelte";
  import AuthPage from "@/features/auth/AuthPage.svelte";
  import { getSession } from "$lib/lib/session.svelte";
  import { routes } from "./routes";

  const session = getSession();
</script>

{#if session.status === "loading"}
  <div class="flex min-h-dvh items-center justify-center">
    <p class="text-sm text-muted-foreground">Loading…</p>
  </div>
{:else if session.status === "guest"}
  <AuthPage />
{:else}
  <Router {routes} />
  <AppToaster />
  <UpdateDialog />
{/if}