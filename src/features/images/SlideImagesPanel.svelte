<script lang="ts">
  import {
    ClipboardPaste,
    Image as ImageIcon,
    LoaderCircle,
    Move3d,
    Trash2,
  } from "@lucide/svelte";
  import Button from "$lib/ui/Button.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import SliderField from "$lib/ui/SliderField.svelte";
  import Switch from "$lib/ui/Switch.svelte";
  import Label from "$lib/ui/Label.svelte";
  import { api } from "$lib/lib/tauri-api";
  import { notify } from "$lib/lib/toast";
  import { cn } from "$lib/lib/utils";
  import {
    createSlideImage,
    type SlideImage,
    type SlideImageRole,
  } from "$lib/types";
  import {
    imageEditorState,
    selectImage,
    closeImageEditor,
  } from "./image-editor-state.svelte";

  let {
    slideId,
    images,
    onPatch,
    onAdd,
    onRemove,
  }: {
    slideId: string | undefined;
    images: SlideImage[];
    onPatch: (id: string, patch: Partial<SlideImage>) => void;
    onAdd: (img: SlideImage) => void;
    onRemove: (id: string) => void;
  } = $props();

  let busy = $state<"none" | "file" | "clipboard">("none");

  const selected = $derived(
    images.find((i) => i.id === imageEditorState.selectedImageId) ?? null,
  );

  async function addFromFile() {
    if (!slideId) return;
    busy = "file";
    try {
      const src = await api.pickImageFile();
      if (src) {
        const img = createSlideImage(src, "element");
        onAdd(img);
        selectImage(img.id);
      }
    } catch (err) {
      notify.error(
        `Failed to load image: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      busy = "none";
    }
  }

  async function pasteClipboard() {
    if (!slideId) return;
    busy = "clipboard";
    try {
      const src = await api.readClipboardImage();
      if (src) {
        const img = createSlideImage(src, "element");
        onAdd(img);
        selectImage(img.id);
      } else {
        notify.message("The clipboard doesn't contain an image.");
      }
    } catch (err) {
      notify.error(
        `Failed to read clipboard: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      busy = "none";
    }
  }

  function patchSelected(patch: Partial<SlideImage>) {
    if (selected) onPatch(selected.id, patch);
  }
</script>

<div class="flex flex-col gap-2 p-2">
  <div class="flex items-center gap-1.5">
    <Button
      size="sm"
      variant="outline"
      disabled={!slideId || busy !== "none"}
      onclick={addFromFile}
      title="Add an image from a file"
      class="h-7 flex-1 text-xs"
    >
      {#if busy === "file"}
        <LoaderCircle class="animate-spin" />
      {:else}
        <ImageIcon />
      {/if}
      From file
    </Button>
    <Button
      size="sm"
      variant="outline"
      disabled={!slideId || busy !== "none"}
      onclick={pasteClipboard}
      title="Paste an image from the clipboard"
      class="h-7 flex-1 text-xs"
    >
      {#if busy === "clipboard"}
        <LoaderCircle class="animate-spin" />
      {:else}
        <ClipboardPaste />
      {/if}
      Paste
    </Button>
  </div>

  {#if imageEditorState.editMode && images.length > 0}
    <div
      class="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-[10px] text-muted-foreground"
    >
      <Move3d class="h-3.5 w-3.5 shrink-0" />
      Drag layers on the preview to position them. Click a layer to select it.
    </div>
  {/if}

  {#if images.length === 0}
    <p class="px-1 py-2 text-[11px] text-muted-foreground">
      No images yet. Add a file or paste one from your clipboard.
    </p>
  {:else}
    <ul class="flex max-h-56 flex-col gap-1 overflow-y-auto pr-0.5">
      {#each images as img (img.id)}
        <li>
          <div
            class={cn(
              "group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/40",
              selected?.id === img.id && "border-primary/40 bg-muted/60",
            )}
            role="button"
            tabindex="0"
            onclick={() => selectImage(img.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectImage(img.id);
              }
            }}
          >
            <div class="h-10 w-16 shrink-0 overflow-hidden bg-muted">
              <img
                src={img.src}
                alt=""
                draggable={false}
                class="h-full w-full object-cover"
              />
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <SelectField
                value={img.role}
                options={[
                  { value: "element", label: "Element" },
                  { value: "background", label: "Background" },
                ]}
                onchange={(e) => {
                  onPatch(img.id, {
                    role: e.currentTarget.value as SlideImageRole,
                  });
                }}
                onfocus={(e) => e.stopPropagation()}
                title="Image role"
              />
              <div
                class="flex items-center gap-2 text-[10px] text-muted-foreground"
              >
                <span class={cn("truncate", img.opacity < 100 && "opacity-80")}>
                  Opacity {img.opacity}%
                </span>
                {#if img.role === "element"}
                  <span class="shrink-0 rounded bg-muted px-1 py-0.5">
                    z {img.zIndex}
                  </span>
                {:else}
                  <span class="shrink-0 rounded bg-muted px-1 py-0.5">Fill</span
                  >
                {/if}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remove image"
              onclick={(e) => {
                e.stopPropagation();
                onRemove(img.id);
              }}
            >
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if selected}
    <div class="space-y-2.5 border-t pt-2">
      <SliderField
        label="Opacity"
        value={selected.opacity}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onPreview={(v) => patchSelected({ opacity: v })}
        onCommit={(v) => patchSelected({ opacity: v })}
      />

      {#if selected.role === "element"}
        <div class="grid grid-cols-2 gap-2">
          <SliderField
            label="Position X"
            value={selected.x}
            min={0}
            max={100}
            step={0.5}
            format={(v) => `${v}%`}
            onPreview={(v) => patchSelected({ x: v })}
            onCommit={(v) => patchSelected({ x: v })}
          />
          <SliderField
            label="Position Y"
            value={selected.y}
            min={0}
            max={100}
            step={0.5}
            format={(v) => `${v}%`}
            onPreview={(v) => patchSelected({ y: v })}
            onCommit={(v) => patchSelected({ y: v })}
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <SliderField
            label="Width"
            value={selected.width ?? 50}
            min={5}
            max={100}
            step={0.5}
            format={(v) => `${v}%`}
            onPreview={(v) => patchSelected({ width: v })}
            onCommit={(v) => patchSelected({ width: v })}
          />
          <div class="min-w-0 space-y-1 pt-1">
            <div class="flex items-center justify-between gap-2">
              <Label class="text-[10px]">Auto height</Label>
              <Switch
                checked={selected.height == null}
                onCheckedChange={(auto) =>
                  patchSelected(auto ? { height: null } : { height: 50 })}
              />
            </div>
            {#if selected.height != null}
              <SliderField
                label="Height"
                value={selected.height}
                min={5}
                max={100}
                step={0.5}
                format={(v) => `${v}%`}
                onPreview={(v) => patchSelected({ height: v })}
                onCommit={(v) => patchSelected({ height: v })}
              />
            {/if}
          </div>
        </div>

        <SliderField
          label="Z-index"
          value={selected.zIndex}
          min={1}
          max={999}
          step={1}
          onPreview={(v) => patchSelected({ zIndex: v })}
          onCommit={(v) => patchSelected({ zIndex: v })}
        />
      {/if}

      <div class="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          class="h-7 text-xs text-muted-foreground"
          onclick={() => {
            closeImageEditor();
          }}
        >
          Done
        </Button>
      </div>
    </div>
  {/if}
</div>
