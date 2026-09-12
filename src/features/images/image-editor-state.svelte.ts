/**
 * image-editor-state — local editor UI state for the slide image panel.
 * Not persisted; resets per app session.
 */
interface ImageEditorState {
  /** Whether the image panel drawer is mounted/visible. */
  open: boolean;
  /** Whether the preview canvas accepts drag/resize of image layers. */
  editMode: boolean;
  /** Currently selected layer id while edit mode is on. */
  selectedImageId: string | null;
}

export const imageEditorState: ImageEditorState = $state({
  open: false,
  editMode: false,
  selectedImageId: null,
});

export function openImageEditor() {
  imageEditorState.open = true;
  imageEditorState.editMode = true;
}

export function toggleImageEditMode() {
  imageEditorState.editMode = !imageEditorState.editMode;
  if (!imageEditorState.editMode) imageEditorState.selectedImageId = null;
}

export function closeImageEditor() {
  imageEditorState.open = false;
  imageEditorState.editMode = false;
  imageEditorState.selectedImageId = null;
}

export function selectImage(id: string | null) {
  imageEditorState.selectedImageId = id;
}
