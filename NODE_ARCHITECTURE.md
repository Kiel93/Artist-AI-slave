# Artist Assistant: Node Design Specification

> This document defines the architectural and UI standards for node blocks within the Artist Assistant workspace. AI agents should refer to these rules when creating or modifying nodes.

---

## 1. Visual Language & Color Coding
Consistency in color helps users identify data types at a glance:

*   **Text Data** (Prompts/Fragments/Connectors): Use **Blue** (`#3b82f6`) for handles and accents.
*   **Image Data** (Reference/Sketch/Analyzer): Use **Emerald/Green** (`#22c55e`) for handles and accents.
*   **AI Logic** (Refiners/Optimizers): Use **Purple** (`#a855f7`) for handles and accents.
*   **Output/Final Results**: Use **Amber/Gold** (`#fbbf24`) for borders and glow effects.

---

## 2. Layout & Content Standards

### The "No Scrollbar" Rule
*   All text-based nodes MUST NOT use internal scrollbars. 
*   Text boxes should be **expandable** and grow vertically to fit their content. Avoid `overflow-y-auto` or `line-clamp` on primary content.

### Collapsible Text Containers
*   To prevent a single long text block from consuming the entire workspace, nodes should implement a **collapsible toggle**.
*   **Icon-based**: Use a simple chevron-style icon (e.g., `ChevronDown` for expand and `ChevronUp` for collapse) instead of text labels.
*   **Placement**: The collapse/expand button MUST be placed uniformly at the **top right** of the textbox it controls.
*   By default, long outputs should be truncated or collapsed, allowing the user to expand them when needed.

### Image Display
*   When displaying images inside a node block, the container must be **expandable vertically** to naturally fit the full image height. 
*   Avoid forcing fixed aspect ratios (like `aspect-video` or `aspect-square`) on primary single-image displays if it causes awkward whitespace or constraints.
*   The image must be displayed in full without cropping the top or bottom parts (`object-contain` or natural `img` sizing).

### Node Container Styling
*   **Background**: Deep dark background (`bg-[#1a1525]` or similar).
*   **Header**: Include a Lucide icon and a bold, uppercase title.
*   **Selection**: Apply a gold glow (`shadow-[0_0_20px_rgba(251,191,36,0.3)]`) and a thicker border when `selected` is true.

---

## 3. Dynamic Handle Spawning (The "+" Pattern)
For nodes that act as "Connectors" or "Analyzers" and can take multiple inputs:

1.  **The Plus Handle**: Add a special target handle with ID `[type]-plus` (e.g., `text-plus` or `image-plus`).
2.  **UI**: Style it as a circular `+` button on the left side of the node.
3.  **Logic**: `Canvas.tsx` listens for connections to these handles. When triggered, it generates a new unique ID (e.g., `text-dyn-1234`) and adds it to the node's `data` (e.g., `data.handles` or `data.imageInputs`).
4.  **Auto-Cleanup**: Nodes should monitor their connections via `useEdges` and remove dynamic handles that are no longer connected and haven't been "ever used."

---

## 4. State Management (Master Blueprint)
Nodes in this project follow a "Master Blueprint" pattern:

*   **Reactive Data**: Nodes should primarily drive their UI from the `data` prop.
*   **Direct Updates**: When a node's internal state changes (e.g., user edits a text field or an API returns a result), the node must call `setNodes` from `useReactFlow` to update the global canvas state.
*   **Sync**: This ensures that when `Canvas.tsx` triggers a save to **IndexedDB**, the latest version of every node's content is captured.
