# Map Generator Architecture

The Map Generator is a complex procedural generation and rendering system designed to create, visualize, and edit 2.5D isometric tile-based maps. It combines algorithmic terrain generation with a custom isometric canvas renderer.

## Core Components

The system is split into four primary architectural pillars:

1. **`TerrainGenerator.ts` (The Engine)**
   - Responsible for the mathematical generation of the map structure.
   - Uses Seeded Randomness and Perlin-like noise to procedurally generate island shapes.
   - Applies Cellular Automata (Game of Life rules) to smooth the procedural noise into natural-looking landmasses.
   - Outputs a multi-layered matrix of `MapGridCell` objects representing the raw abstract data of the map (land vs. water).

2. **`MapGeneratorWorkspace.tsx` (The Orchestrator)**
   - Manages the global state of the application, including the loaded assets, active user selections, and undo/redo history.
   - Acts as the central hub connecting the parameter controls, the asset manager, and the visual preview.
   - Handles the injection of user-painted "overrides" (manual edits) into the procedural generation flow.

3. **`MapPreview.tsx` (The Renderer)**
   - A highly optimized HTML5 Canvas engine tailored for isometric rendering.
   - Handles the complex mathematical mapping between 2D screen space (mouse coordinates) and 3D isometric grid space (`gx`, `gy`).
   - Implements advanced rendering techniques such as:
     - **Frustum Culling**: Only drawing tiles currently visible on the screen.
     - **Distance Fields**: Calculating Chebyshev distance from the island to drive the ocean darkness tapering.
     - **Peninsula Smoothing**: Eliminating 1x1 jagged artifacts in painted ocean depths.
     - **Dynamic Masking**: Layering procedural foam and darkness masks onto the water using canvas composite operations (`source-over`, `multiply`, `source-in`).

4. **`ParameterUI.tsx` (The Controller)**
   - Exposes the generation parameters (seed, noise scale, island size, ocean depths) to the user.
   - Pre-renders complex asset compositions (such as combining base ocean tiles with procedural foam colors and transparency) into flat images before passing them to the rendering engine. This ensures the 60fps render loop isn't bogged down by heavy composite operations.

---

## The Rendering Pipeline

The rendering loop inside `MapPreview.tsx` executes in strict passes to ensure proper depth sorting and blending:

1. **Grid Generation**: The raw grid is retrieved from `TerrainGenerator`.
2. **Distance Calculation**: A Breadth-First Search (BFS) computes the distance of every water tile to the nearest landmass.
3. **Level Mapping**: The raw BFS distances are converted into discrete "Taper Levels" based on user-defined widths.
4. **Smoothing**: A smoothing algorithm refines the water levels to ensure smooth gradients.
5. **Depth Sorting**: All visible cells across all layers are flattened into a single array and sorted by `cell.depth` (calculated as `row + col + layer * 1000`). This ensures tiles further "back" in isometric space are drawn first, preventing overlap visual bugs (Painter's Algorithm).
6. **Drawing**:
   - **Base Tiles**: The engine draws the main tile asset.
   - **Ocean Tapers**: For water tiles, dynamic masks are layered with `multiply` blending to darken the water based on its calculated distance level.
   - **Foam**: If the tile is water but neighbors land, a `source-over` tinted foam mask is drawn.
   - **Objects**: Props and scenery are layered on top based on their pivot points.

---

## The Ocean Tile Offset (Visual Depth Alignment)

A critical component of the isometric rendering math involves aligning 3D ground blocks with 2D ocean planes. 

### The Problem
The ground tiles are 3D blocks (e.g., `280x280` or `140x140` pixels) that possess actual simulated height (70 pixels). Because of this vertical height, the "root" (the bottom of the dirt block) is actually 70 pixels lower than the top surface. 

However, the ocean tiles are strictly flat 2D top-faces (e.g., `280x140` or `140x70` pixels). When the rendering engine calculates the grid coordinate for a ground tile and places it at `(isoX, isoY)`, it places the *entire* 3D block there. Because the coordinate system doesn't account for the intrinsic height baked into the PNG, the flat 2D ocean tiles become visually misaligned (they appear to float or sit too high relative to the visual top of the ground block).

### The Mathematical Solution
To match the ground tiles and ocean tiles visually, the ocean tiles must be physically shifted downwards on the screen by exactly the height of the ground block (70 pixels).

In isometric mathematics:
- Moving **1 tile Eastward** (`+1` to column) shifts the screen position `+X` and `+Y`.
- Moving **1 tile Southward** (`+1` to row) shifts the screen position `-X` and `+Y`.

When both are combined (`+1` column AND `+1` row):
- The `X` shift cancels out completely.
- The `Y` shift stacks, moving the tile straight down the screen by exactly `2 * tileHalfHeight` (which equals the 70px height of the block).

Therefore, to properly anchor the flat 2D ocean face to the bottom "root" of the 3D ground blocks, we offset the ocean tiles **one tile southward and one tile eastward** in grid space. This flawlessly compensates for the baked-in height of the ground assets without requiring complex pixel-level offsets in the rendering loop.
