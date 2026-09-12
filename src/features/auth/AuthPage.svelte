<script lang="ts">
  /**
   * Auth gate — shown whenever there is no valid session. The server owns the
   * session cookie; this page is the only non-authenticated entry point.
   */
  import { Loader2 } from "@lucide/svelte";
  import Card from "$lib/ui/Card.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Input from "$lib/ui/Input.svelte";
  import Label from "$lib/ui/Label.svelte";
  import { login, register } from "$lib/lib/session.svelte";

  type Mode = "login" | "register";

  let mode = $state<Mode>("login");
  let username = $state("");
  let password = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    error = null;
    submitting = true;
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong";
    } finally {
      submitting = false;
    }
  }

  $effect(() => {
    if (error) error = null;
  });
</script>

<div class="flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
  <div class="flex flex-col items-center gap-2 text-center">
    <h1 class="text-2xl font-semibold tracking-tight">DevSlidesOnline</h1>
    <p class="max-w-sm text-sm text-muted-foreground">
      Your slides, synced to a server — sign in to get started.
    </p>
  </div>

  <Card class="w-full max-w-sm p-6">
    <div class="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
      {#each [["login", "Sign in"], ["register", "Create account"]] as [value, label]}
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors
            {mode === value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (mode = value as Mode)}
        >
          {label}
        </button>
      {/each}
    </div>

    <form class="flex flex-col gap-4" onsubmit={submit}>
      <div class="flex flex-col gap-1.5">
        <Label for="auth-username">Username</Label>
        <Input
          id="auth-username"
          bind:value={username}
          autocomplete="username"
          placeholder="you"
          autofocus
          required
          minlength={3}
          maxlength={32}
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for="auth-password">Password</Label>
        <Input
          id="auth-password"
          type="password"
          bind:value={password}
          autocomplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="••••••••"
          required
          minlength={8}
          maxlength={128}
        />
      </div>

      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}

      <Button type="submit" size="lg" class="mt-1 w-full" disabled={submitting}>
        {#if submitting}
          <Loader2 class="animate-spin" />
        {/if}
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
    </form>
  </Card>

  <p class="text-xs text-muted-foreground">
    Passwords are hashed server-side; your presentations are private to your account.
  </p>
</div>