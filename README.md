# NoteDrift

**Open. Think. Create.**

An instant, browser-based scratch space. Open it and you get a clean, infinite
white canvas immediately — no sign-up, no login, no onboarding, no dashboard.
Write, draw, sketch, diagram, or brainstorm the moment the page loads. Your work
is saved locally and survives refreshes automatically.

> `/` opens directly into the editor. There is no marketing homepage (yet) —
> the blank canvas _is_ the product.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other scripts:

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
npx tsc --noEmit # type-check
```

Requires Node 18+ (developed on Node 24).

---

## Tech stack

| Concern       | Choice                                              |
| ------------- | --------------------------------------------------- |
| Framework     | Next.js 16 (App Router) + React 19                  |
| Language      | TypeScript (strict)                                 |
| Styling       | Tailwind CSS v4                                      |
| Canvas engine | [Fabric.js](http://fabricjs.com/) v7 — **MIT**      |
| Icons         | lucide-react — **ISC**                              |
| Persistence   | IndexedDB (canvas docs) + localStorage (page index) |

No backend, no auth, no database, no external services. Everything runs in the
browser and stores data locally on the device.

### Why Fabric.js?

We needed a mature, commercially-licensed engine that ships freehand drawing,
text, shapes, selection/transform, JSON (de)serialization, and PNG export out of
the box — while still letting us build our _own_ minimal, branded UI on top.
Fabric.js fits exactly: it is **MIT licensed** (free for commercial use, no
watermark, no fee), battle-tested since 2010, and gives us object serialization
(`toJSON`/`loadFromJSON`) that makes autosave and undo/redo straightforward.

Alternatives considered: **tldraw** (excellent, but its license requires a
watermark or a paid business license) and **Excalidraw** (MIT, but ships its own
full app UI that would fight the custom toolbar/top-bar layout we want).

---

## Architecture

The design separates **imperative canvas logic** (Fabric) from **declarative UI**
(React). React never touches Fabric directly.

```
src/
  app/
    layout.tsx          Root layout, fonts, metadata, dark theme
    page.tsx            Client entry — dynamically imports the editor (ssr:false)
    globals.css         Theme tokens + base styles (Tailwind v4)
    icon.png            App/tab icon (brand mark)
    apple-icon.png
  components/
    editor/
      Editor.tsx        Orchestrator: owns the controller, page state, shortcuts
      TopBar.tsx        Logo, page switcher, New Page, Undo/Redo, Export, menu
      Toolbar.tsx       Left floating tool palette (+ Shape popover)
      ZoomControls.tsx  Bottom-left zoom % and grid toggle
      Logo.tsx          NoteDrift SVG mark
    ui/
      IconButton.tsx    Reusable icon button
  lib/
    canvasController.ts The Fabric engine wrapper (tools, drawing, zoom/pan,
                        history, export, autosave). The heart of the app.
    shapes.ts           Arrow + sticky-note factories (composite Fabric groups)
    history.ts          Undo/redo snapshot stack
    storage.ts          IndexedDB (canvas docs) + localStorage (pages, prefs)
    constants.ts        Colors, grid size, zoom limits, fonts
    types.ts            Tool / EditorState / PageMeta types
brand/                  Brand source assets (logo, mockups) — not imported
```

### Data flow

1. `page.tsx` dynamically imports `Editor` with `ssr: false` (Fabric needs
   browser APIs, so it must never run during SSR/prerender).
2. `Editor` mounts a `<canvas>`, bootstraps the page list from storage, and
   creates one `CanvasController`.
3. The controller emits an `EditorState` snapshot (`onState`) on every change;
   React re-renders the chrome from it. UI actions call controller methods.
4. On every meaningful change the controller records an undo snapshot and
   schedules a debounced autosave (`onPersist`).

### Persistence model

- **Canvas documents** (Fabric JSON, can be large because pasted images embed as
  data URLs) → **IndexedDB**, keyed by page id.
- **Page index** (`{id, title, createdAt, updatedAt}`), **current page id**, and
  **prefs** (grid on/off) → **localStorage** (tiny, needed synchronously).
- Autosave is debounced (~600 ms). Switching pages flushes the current page
  first, so nothing is lost.

---

## Features (MVP)

- Infinite white canvas with an optional dotted grid
- Tools: **Select, Pen, Text, Rectangle, Ellipse, Line, Arrow, Sticky note,
  Eraser** (+ image insert)
- Select / move / resize objects
- Undo / redo (async loads are serialized so rapid undo/redo can't corrupt state)
- Zoom in / out / reset, pan (scroll / two-finger / space-drag / middle-mouse)
- Zoom toward the pointer on Ctrl-scroll / pinch
- Paste images from the clipboard; drag & drop image files
- Export the whole canvas as a 2× PNG (white background)
- New Page + a lightweight recent-pages list (not a dashboard)
- Automatic local save — work survives a browser refresh with no account

### Keyboard shortcuts

| Key                               | Action                |
| --------------------------------- | --------------------- |
| `V`                               | Select                |
| `P`                               | Pen                   |
| `T`                               | Text                  |
| `R` / `O` / `L`                   | Rect / Ellipse / Line |
| `A`                               | Arrow                 |
| `N`                               | Sticky note           |
| `E`                               | Eraser                |
| `Delete` / `Backspace`            | Delete selection      |
| `Ctrl/⌘ + Z`                      | Undo                  |
| `Ctrl/⌘ + Shift + Z` / `Ctrl + Y` | Redo                  |
| `Ctrl/⌘ + +/−/0`                  | Zoom in / out / reset |
| Hold `Space` + drag               | Pan                   |

---

## Known limitations / next steps

- **Eraser** deletes whole objects (click or drag over them), not pixels.
- **Sticky-note text** is editable while you work; after a reload a note becomes
  a static group (still movable/deletable) — text re-editing after reload is a
  planned improvement.
- **Export** captures all content on a white background; per-selection export and
  SVG export are future additions.
- Desktop-first. It works on tablets, but touch gestures aren't tuned yet.
- No backend by design — data lives only in the current browser/device.
- The optional right panel (Mind Map / Flowchart / Wireframe / Math / Sketch
  starters) is intentionally not built yet.

---

## License notes

- Fabric.js — MIT
- lucide-react — ISC

Both are free for commercial use. See `node_modules/<pkg>/LICENSE`.
