# Phased Implementation of Compound Nodes

## Context
Implementing Compound Nodes (Nested Sub-Graphs) is a complex architectural shift. It touches the underlying data model, the execution engine, canvas rendering, and file serialization. Breaking it down into sequential phases ensures that we have stable foundations before adding UI complexity.

## Phase 1: Data Structure & Headless Execution
**Goal:** Define the data model for nested graphs and update the execution engine to support them.
**Description:** Create a new `CompoundNode` type that stores its own internal collection of nodes and edges. Update your graph runner/execution engine so that when it evaluates a `CompoundNode`, it recursively enters and evaluates the internal graph. **No UI changes are made yet.**

### Pros:
- Isolates core logic from UI complexities.
- Highly testable. You can verify this phase entirely via unit tests or console logs by passing inputs to a programmatic compound node and asserting the outputs.

### Cons:
- Invisible to end-users (purely backend/logic).

**Effort:** Medium

## Phase 2: Canvas UI & Sub-Graph Navigation
**Goal:** Render the Compound Node visually and allow users to "dive into" it.
**Description:** Update the canvas renderer to draw the new Compound Node type. Implement an interaction (like double-clicking) to switch the canvas context to the internal sub-graph. Add a navigation UI (e.g., breadcrumbs like `Main Graph > My Custom Pipeline`) to allow users to zoom back out to the parent level.

### Pros:
- Establishes the core user experience for interacting with nested graphs.
- Reuses existing canvas rendering logic, simply pointing it to a different array of nodes.

### Cons:
- Requires careful state management to track the active "canvas context" (which level of the graph the user is currently viewing).

**Effort:** Medium

## Phase 3: Dynamic Creation & I/O Routing
**Goal:** Allow users to create Compound Nodes on the fly from a canvas selection.
**Description:** Implement the "Group Selected" command. When triggered:
1. Move the selected nodes into a newly instantiated Compound Node.
2. Automatically generate `Graph Input` and `Graph Output` routing nodes inside the sub-graph.
3. Expose these routing nodes as the external Input/Output pins on the parent Compound Node.
4. Automatically rewire any external connections to these new pins.

### Pros:
- Delivers the core grouping functionality to the user.
- Automating the rewiring feels like magic and prevents the user from having to manually reconnect everything.

### Cons:
- Algorithmically calculating the boundary connections (determining exactly what data needs to go in vs. come out of the selection) can be mathematically tricky.

**Effort:** High

## Phase 4: Serialization & The Asset Library
**Goal:** Enable sharing and reusing across different projects and users.
**Description:** Implement serialization logic to save a Compound Node as a standalone data structure (e.g., a `.json` file). Build a "Library" or "Component" panel where users can view saved Compound Nodes, drag them into new workspaces as instanced nodes, and export them for other users.

### Pros:
- Fulfills the ultimate goal of cross-project and cross-user sharing.
- Paves the way for an ecosystem/marketplace where users can share complex pipelines.

### Cons:
- Introduces versioning challenges (e.g., what happens to an old project if the author updates the shared Compound Node template?).

**Effort:** Medium
