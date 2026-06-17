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

### Vertical Layout Order
*   **Top Panel**: Reserved for the main prompt (text boxes or text handles).
*   **Middle Panel**: Reserved for secondary settings, dropdowns, sliders, or additional input handles.
*   **Bottom Panel**: Reserved for the image preview, placed directly above the action buttons.
*   **Action Buttons**: Placed at the very bottom of the node.

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

## 3. UI Element Aesthetics (Universal Components)
To ensure all nodes feel like they belong to a cohesive application, adhere to the following Tailwind/CSS structural rules for internal UI elements:

*   **Buttons**: Should be chunky and tactile. Use `py-2 text-white text-sm font-bold rounded shadow-lg flex items-center justify-center gap-2 transition-all`. The background color must match the node's semantic color (e.g., `bg-emerald-600 hover:bg-emerald-500` for Image nodes).
*   **Text Inputs / Textareas**: Should sit recessed within the node. Use `bg-black/40 text-gray-200 p-2 rounded border border-[semantic-color]/20 focus:border-[semantic-color]/60 focus:outline-none`.
*   **Sliders (Range Inputs)**: Use `w-full accent-[semantic-color]-500` for native HTML range inputs to match the node's theme.
*   **Icons**: Always use `lucide-react` icons. Give them a standardized size (e.g., `w-5 h-5` for headers, `w-4 h-4` for inline buttons) and tint them with the node's semantic color (e.g., `text-emerald-400`).
*   **Handle Sizing & Position**: ReactFlow handles should be prominent but clean. Override default classes with `!w-4 !h-4 !border-none`. Do NOT manually offset handles with `!left-` or `!right-` classes. Let React Flow's native positioning snap them perfectly to the left and right edges.

---

## 4. Dynamic Handle Spawning (The "+" Pattern)
For nodes that act as "Connectors" or "Analyzers" and can take multiple inputs:

1.  **The Plus Handle**: Add a special target handle with ID `[type]-plus` (e.g., `text-plus` or `image-plus`).
2.  **UI**: Style it as a circular `+` button on the left side of the node.
3.  **Logic**: `Canvas.tsx` listens for connections to these handles. When triggered, it generates a new unique ID (e.g., `text-dyn-1234`) and adds it to the node's `data` (e.g., `data.handles` or `data.imageInputs`).
4.  **Auto-Cleanup**: Nodes should monitor their connections via `useEdges` and remove dynamic handles that are no longer connected and haven't been "ever used."

## 5. Handle Labels & Context
For any node that receives input data via Target handles, the purpose of each handle MUST be clearly labeled within the node UI if it is not immediately obvious (e.g. adjacent to an input box where the connection implies the input value). 
*   **Alignment**: The text label or input box should vertically align with its corresponding handle on the left edge.
*   **Format**: Use small, muted text (e.g. `text-xs text-gray-400`) next to the handle indicating the expected input context, such as "Reference Image", "Style Image", or "Island Image".
*   **Placement**: Place the label inside the node container, flush left against the padding near the handle.
*   **Avoid Overlap**: Use standard DOM layout (e.g. flex columns) for handles with labels rather than absolute positioning across the whole node, to prevent text from overlapping image previews or other elements.

---

## 6. State Management (Master Blueprint)
Nodes in this project follow a "Master Blueprint" pattern:

*   **Reactive Data**: Nodes should primarily drive their UI from the `data` prop. Use controlled components (e.g., `value={data.text || ""}`) rather than uncontrolled ones (`defaultValue`).
*   **Direct Updates**: When a node's internal state changes (e.g., user edits a text field or an API returns a result), the node must call `setNodes` from `useReactFlow` immediately (like inside `onChange` for inputs) to update the global canvas state and prevent UI resets.
*   **Sync**: This ensures that when `Canvas.tsx` triggers a save to **IndexedDB**, the latest version of every node's content is captured.

---

## 7. Standardized Data Payloads (Inter-Node Communication)
To prevent brittle, case-by-case property checking when nodes pass data to one another, all nodes MUST adhere to a universal naming convention for their primary outputs in the `data` object:

*   **Image Output**: Any node that generates or outputs a primary image must store it as a Base64 Data URL or Blob URL under `data.outputImage`. (Legacy keys like `resultUrl`, `imageUrl`, or `bakedImage` should be migrated or mapped to `outputImage`).
*   **Text Output**: Any node that generates or outputs primary text (prompts, analysis, styles) must store it under `data.outputText`.

**Consuming Data**:
When a node (like a Refiner or Output node) reads from incoming edges, it should confidently look for `sourceNode.data.outputImage` or `sourceNode.data.outputText` instead of checking a dozen different potential property names.

---

## 8. Headless Execution & Compound Nodes
To support the Compound Node (Nested Sub-Graphs) architecture, node execution logic must be decoupled from the React UI components.

*   **Logic Extraction**: All API calls, data transformations, and core logic for a node MUST reside in `src/lib/node-executor.ts` as a pure, standalone, asynchronous function (e.g. `executeGeminiRefinerNode`).
*   **React Integration**: The actual React component (e.g. `GeminiRefinerNode.tsx`) should simply gather inputs, call the executor from `node-executor.ts`, and then update its UI and `data` state with the returned results.
*   **Compound Nodes**: A `CompoundNode` acts as an automated pipeline. It traverses its `internalNodes` and `internalEdges`, using `executeNode` from `node-executor.ts` to process data from start to finish without needing to render the internal nodes to the canvas. This requires nodes to be able to execute purely based on their configuration `data` and explicit inputs.
