"use strict";

const STORAGE_KEY = "mini-notes:v1";
const THEME_KEY = "mini-notes:theme";
const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_ERROR = "Storage is full. Your changes may not persist.";

const ICONS = {
  pin: ["M12 17v5", "M5 9l7-6 7 6-3 3H8L5 9Z", "M8 12l4 5 4-5"],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
  remove: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v5M14 11v5"],
  moon: ["M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"],
  sun: ["M12 4V2", "M12 22v-2", "M4 12H2", "M22 12h-2", "M5.6 5.6 4.2 4.2", "M19.8 19.8l-1.4-1.4", "M18.4 5.6l1.4-1.4", "M4.2 19.8l1.4-1.4"]
};

const el = {
  search: document.getElementById("search"),
  searchShortcut: document.getElementById("search-shortcut"),
  newNote: document.getElementById("new-note"),
  themeToggle: document.getElementById("theme-toggle"),
  themeIcon: document.getElementById("theme-icon"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importInput: document.getElementById("import-input"),
  filterButtons: document.querySelectorAll(".filter-btn"),
  sort: document.getElementById("sort"),
  notesGrid: document.getElementById("notes-grid"),
  emptyState: document.getElementById("empty-state"),
  emptyTitle: document.getElementById("empty-title"),
  emptyMessage: document.getElementById("empty-message"),
  emptyAction: document.getElementById("empty-action"),
  noteCount: document.getElementById("note-count"),
  editorDialog: document.getElementById("editor-dialog"),
  form: document.getElementById("note-form"),
  editorMode: document.getElementById("editor-mode"),
  editorTitle: document.getElementById("editor-title"),
  title: document.getElementById("title"),
  tags: document.getElementById("tags"),
  content: document.getElementById("content"),
  charCount: document.getElementById("char-count"),
  formError: document.getElementById("form-error"),
  closeEditor: document.getElementById("close-editor"),
  cancelEditor: document.getElementById("cancel-editor"),
  saveNote: document.getElementById("save-note"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
  toastAction: document.getElementById("toast-action")
};

let notes = [];
let activeFilter = "all";
let editingId = null;
let toastTimer = null;

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function parseTags(value) {
  const seen = new Set();
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function toIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== "object") return null;

  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 100) : "";
  const content = typeof raw.content === "string" ? raw.content : "";
  if (!title && !content.trim()) return null;

  const rawTags = Array.isArray(raw.tags) ? raw.tags.join(", ") : raw.tags;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    title,
    content,
    tags: parseTags(rawTags),
    pinned: Boolean(raw.pinned),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt)
  };
}

function keepUniqueIds(items) {
  const seen = new Set();
  return items.filter((note) => {
    if (!note) return false;
    if (seen.has(note.id)) note.id = uid();
    seen.add(note.id);
    return true;
  });
}

function loadNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return keepUniqueIds(saved.map(normalizeNote));
  } catch (error) {
    return [];
  }
}

function saveNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch (error) {
    return false;
  }
}

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch (error) {}
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function fillSvg(svg, paths, circles = []) {
  const nodes = [];

  paths.forEach((pathData) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    nodes.push(path);
  });

  circles.forEach(({ cx, cy, r }) => {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", r);
    nodes.push(circle);
  });

  svg.replaceChildren(...nodes);
}

function createIcon(paths, circles = []) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  fillSvg(svg, paths, circles);
  return svg;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  const isDark = theme === "dark";
  fillSvg(
    el.themeIcon,
    isDark ? ICONS.sun : ICONS.moon,
    isDark ? [{ cx: 12, cy: 12, r: 4 }] : []
  );
  el.themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  el.themeToggle.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);

  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

  if (dateStart === todayStart) return `Today, ${time}`;
  if (dateStart === yesterdayStart) return `Yesterday, ${time}`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  }).format(date);
}

function showToast(message, actionLabel, action) {
  clearTimeout(toastTimer);
  el.toastMessage.textContent = message;

  if (typeof action === "function") {
    el.toastAction.hidden = false;
    el.toastAction.textContent = actionLabel;
    el.toastAction.onclick = () => {
      hideToast();
      action();
    };
  } else {
    el.toastAction.hidden = true;
    el.toastAction.onclick = null;
  }

  el.toast.hidden = false;
  toastTimer = setTimeout(hideToast, typeof action === "function" ? 6000 : 2600);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.hidden = true;
  el.toastAction.onclick = null;
}

function updateFilterButtons() {
  el.filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getVisibleNotes() {
  const query = el.search.value.trim().toLowerCase();

  const visible = notes.filter((note) => {
    if (activeFilter === "pinned" && !note.pinned) return false;
    if (activeFilter === "tagged" && note.tags.length === 0) return false;
    if (!query) return true;

    return `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(query);
  });

  const sortBy = el.sort.value;
  visible.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    if (sortBy === "title") {
      return (a.title || "Untitled note").localeCompare(b.title || "Untitled note", undefined, {
        sensitivity: "base"
      });
    }

    const field = sortBy === "created" ? "createdAt" : "updatedAt";
    return b[field].localeCompare(a[field]);
  });

  return visible;
}

function createCardButton(label, iconPaths, className, handler, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-btn ${className}`;
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(createIcon(iconPaths));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function focusCardAction(id, action) {
  const card = Array.from(el.notesGrid.children).find((item) => item.dataset.id === id);
  const button = card && card.querySelector(`[data-action="${action}"]`);
  const fallback = el.notesGrid.querySelector(".card-actions [data-action='edit']") || el.emptyAction;
  (button || fallback).focus();
}

function createNoteCard(note) {
  const card = document.createElement("article");
  card.className = `note-card${note.pinned ? " is-pinned" : ""}`;
  card.dataset.id = note.id;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", `Note: ${note.title || "Untitled note"}`);

  const header = document.createElement("div");
  header.className = "card-header";

  const title = document.createElement("h3");
  title.className = "note-title";
  title.textContent = note.title || "Untitled note";
  header.append(title);

  if (note.pinned) {
    const indicator = document.createElement("span");
    indicator.className = "pin-indicator";
    indicator.title = "Pinned";
    indicator.append(createIcon(ICONS.pin));
    header.append(indicator);
  }

  const preview = document.createElement("p");
  preview.className = "note-preview";
  preview.textContent = note.content.trim() || "No additional content";

  card.append(header, preview);

  if (note.tags.length > 0) {
    const tagList = document.createElement("div");
    tagList.className = "tag-list";
    note.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      tagList.append(chip);
    });
    card.append(tagList);
  }

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const date = document.createElement("span");
  date.textContent = formatRelativeDate(note.updatedAt);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const pinButton = createCardButton(
    note.pinned ? "Unpin note" : "Pin note",
    ICONS.pin,
    note.pinned ? "is-active" : "",
    () => togglePin(note.id),
    "pin"
  );
  const editButton = createCardButton("Edit note", ICONS.edit, "", () => openEditor(note.id), "edit");
  const deleteButton = createCardButton("Delete note", ICONS.remove, "is-danger", () => deleteNote(note.id), "delete");

  actions.append(pinButton, editButton, deleteButton);
  footer.append(date, actions);
  card.append(footer);

  card.addEventListener("click", () => openEditor(note.id));

  return card;
}

function render() {
  const visible = getVisibleNotes();
  const query = el.search.value.trim();

  const counts = {
    all: notes.length,
    pinned: notes.filter((note) => note.pinned).length,
    tagged: notes.filter((note) => note.tags.length > 0).length
  };
  document.querySelectorAll("[data-count]").forEach((badge) => {
    badge.textContent = counts[badge.dataset.count];
  });

  el.noteCount.textContent = visible.length === notes.length
    ? plural(notes.length, "note")
    : `${visible.length} of ${plural(notes.length, "note")}`;

  updateFilterButtons();
  el.notesGrid.replaceChildren(...visible.map(createNoteCard));
  el.emptyState.hidden = visible.length > 0;

  if (visible.length === 0) {
    let config;

    if (notes.length === 0) {
      config = {
        title: "No notes yet",
        message: "Create your first note and it will show up here.",
        action: "Create a note",
        mode: "create"
      };
    } else if (query) {
      config = {
        title: "No matches",
        message: "Try a different search term or clear the search.",
        action: "Clear search",
        mode: "clear"
      };
    } else if (activeFilter === "pinned") {
      config = {
        title: "No pinned notes",
        message: "Pin a note to keep it close at hand.",
        action: "View all notes",
        mode: "all"
      };
    } else {
      config = {
        title: "No tagged notes",
        message: "Add tags to a note to find it faster later.",
        action: "View all notes",
        mode: "all"
      };
    }

    el.emptyTitle.textContent = config.title;
    el.emptyMessage.textContent = config.message;
    el.emptyAction.textContent = config.action;
    el.emptyAction.dataset.action = config.mode;
    el.emptyAction.hidden = false;
  }

  return visible;
}

function updateCharCount() {
  const count = el.content.value.length;
  el.charCount.textContent = plural(count, "character");
}

function openEditor(id = null) {
  const note = id ? notes.find((item) => item.id === id) : null;
  editingId = note ? note.id : null;

  el.form.reset();
  el.formError.hidden = true;
  el.formError.textContent = "";
  el.title.value = note ? note.title : "";
  el.tags.value = note ? note.tags.join(", ") : "";
  el.content.value = note ? note.content : "";
  updateCharCount();

  el.editorMode.textContent = note ? "Edit note" : "New note";
  el.editorTitle.textContent = note ? "Update your note" : "Write something down";
  el.saveNote.textContent = note ? "Save changes" : "Save note";

  if (typeof el.editorDialog.showModal === "function") {
    if (!el.editorDialog.open) el.editorDialog.showModal();
  } else {
    el.editorDialog.setAttribute("open", "");
  }

  setTimeout(() => {
    (note ? el.content : el.title).focus();
  }, 0);
}

function closeEditor() {
  if (typeof el.editorDialog.close === "function") {
    el.editorDialog.close();
  } else {
    el.editorDialog.removeAttribute("open");
  }
}

function handleSubmit(event) {
  event.preventDefault();

  const title = el.title.value.trim();
  const content = el.content.value;
  const tags = parseTags(el.tags.value);

  if (!title && !content.trim()) {
    el.formError.textContent = "Add a title or some content before saving.";
    el.formError.hidden = false;
    el.title.focus();
    return;
  }

  const now = new Date().toISOString();
  const wasEditing = Boolean(editingId);

  if (editingId) {
    const note = notes.find((item) => item.id === editingId);
    if (note) {
      note.title = title;
      note.content = content;
      note.tags = tags;
      note.updatedAt = now;
    }
  } else {
    notes.unshift({
      id: uid(),
      title,
      content,
      tags,
      pinned: false,
      createdAt: now,
      updatedAt: now
    });
  }

  const saved = saveNotes();
  closeEditor();
  render();
  showToast(saved ? (wasEditing ? "Note updated" : "Note added") : STORAGE_ERROR);
}

function togglePin(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;

  note.pinned = !note.pinned;
  const saved = saveNotes();
  render();
  focusCardAction(id, "pin");
  showToast(saved ? (note.pinned ? "Note pinned" : "Note unpinned") : STORAGE_ERROR);
}

function deleteNote(id) {
  const index = notes.findIndex((item) => item.id === id);
  if (index === -1) return;

  const [deleted] = notes.splice(index, 1);
  const saved = saveNotes();
  render();
  focusCardAction(null, "edit");

  showToast(saved ? "Note deleted" : STORAGE_ERROR, "Undo", () => {
    notes.splice(Math.min(index, notes.length), 0, deleted);
    const restored = saveNotes();
    render();
    showToast(restored ? "Note restored" : STORAGE_ERROR);
  });
}

function exportNotes() {
  if (notes.length === 0) {
    showToast("Nothing to export");
    return;
  }

  const payload = JSON.stringify(
    {
      app: "mini-notes",
      version: 1,
      exportedAt: new Date().toISOString(),
      notes
    },
    null,
    2
  );

  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `notes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast(plural(notes.length, "note") + " exported");
}

async function importNotes(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const rawNotes = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.notes) ? parsed.notes : null;
    if (!rawNotes) throw new Error("Invalid file");

    const imported = keepUniqueIds(rawNotes.map(normalizeNote));

    if (imported.length === 0) throw new Error("No notes found");

    const message = `Import ${plural(imported.length, "note")}? This replaces your current ${plural(notes.length, "note")}.`;
    if (!confirm(message)) return;

    notes = imported;
    const saved = saveNotes();
    render();
    showToast(saved ? plural(imported.length, "note") + " imported" : STORAGE_ERROR);
  } catch (error) {
    showToast("Could not import that file");
  }
}

function init() {
  notes = loadNotes();
  applyTheme(getInitialTheme());

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  el.searchShortcut.textContent = isMac ? "⌘ K" : "Ctrl K";

  el.newNote.addEventListener("click", () => openEditor());

  el.search.addEventListener("input", render);
  el.sort.addEventListener("change", render);

  el.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      render();
    });
  });

  el.emptyAction.addEventListener("click", () => {
    const mode = el.emptyAction.dataset.action;
    if (mode === "create") {
      openEditor();
    } else if (mode === "clear") {
      el.search.value = "";
      render();
      el.search.focus();
    } else if (mode === "all") {
      activeFilter = "all";
      render();
    }
  });

  el.form.addEventListener("submit", handleSubmit);
  el.closeEditor.addEventListener("click", closeEditor);
  el.cancelEditor.addEventListener("click", closeEditor);
  el.editorDialog.addEventListener("click", (event) => {
    if (event.target === el.editorDialog) closeEditor();
  });
  el.editorDialog.addEventListener("close", () => {
    el.formError.hidden = true;
  });

  el.content.addEventListener("input", () => {
    updateCharCount();
    el.formError.hidden = true;
  });
  el.title.addEventListener("input", () => {
    el.formError.hidden = true;
  });

  el.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      showToast("Could not save theme preference");
    }
  });

  el.exportBtn.addEventListener("click", exportNotes);
  el.importBtn.addEventListener("click", () => el.importInput.click());
  el.importInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importNotes(file);
    event.target.value = "";
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      const activeElement = document.activeElement;
      const activeCard = activeElement && activeElement.closest ? activeElement.closest(".note-card") : null;
      const activeId = activeCard ? activeCard.dataset.id : null;
      const activeAction = activeElement && activeElement.dataset ? activeElement.dataset.action : null;

      notes = loadNotes();
      if (el.editorDialog.open) {
        closeEditor();
        editingId = null;
        el.newNote.focus();
        showToast("Notes changed in another tab");
      }
      render();

      if (activeId && activeAction) focusCardAction(activeId, activeAction);
    }
    if (event.key === THEME_KEY && (event.newValue === "dark" || event.newValue === "light")) {
      applyTheme(event.newValue);
    }
  });

  document.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (modifier && key === "k" && !el.editorDialog.open) {
      event.preventDefault();
      el.search.focus();
      el.search.select();
      return;
    }

    if (modifier && key === "n" && !el.editorDialog.open) {
      event.preventDefault();
      openEditor();
      return;
    }

    if (event.key === "Escape" && !el.editorDialog.open && document.activeElement === el.search && el.search.value) {
      el.search.value = "";
      render();
    }
  });

  render();
}

init();
