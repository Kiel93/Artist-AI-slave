# Web App to Unity Map Exporter Documentation

## 1. Overview
The Web App generates maps using a 2D HTML5 canvas isometric grid system. However, Unity's native environment (standardized in `MAP_11`) utilizes dual Grid systems (`Isometric` and `Isometric Z as Y`) with specific mathematically scaled axes. The exporter acts as the bridge by generating a `MapConfig.json` payload and injecting an automated C# parser (`ApplyMapConfigEditor.cs`) that handles all native Unity conversion logic automatically.

## 2. Grid Architecture
The Unity environment requires two superimposed grids to handle large terrain tiles and small objects independently. The C# script employs a "find and create" automation level: it searches for this exact structure by name, and if missing, automatically generates the grids and tilemaps from scratch.

### Macro Grid (Terrain)
- **Object Name:** `Gridx3`
- **Cell Layout:** `Isometric` (Enum Value: 2)
- **Cell Size:** `x: 3.0, y: 1.5, z: 1.0`
- **Purpose:** Renders the large 280x140 pixel web app terrain tiles (Ground, Foam, Ocean) on completely separate tilemaps for guaranteed Z-sorting.
- **Tilemaps:** 
  - `Foam` (Layer 0)
  - `Ocean` (Layer -1)
  - `Ground` (Layer 1)

### Micro Grid (Objects & Buildable Area)
- **Object Name:** `Grid`
- **Cell Layout:** `Isometric Z as Y` (Enum Value: 3)
- **Cell Size:** `x: 1.0, y: 0.5, z: 1.0`
- **Purpose:** Handles pixel-perfect placement of prefabs and the `BuildableGrid`.
- **Tilemaps:**
  - `BuildableGrid` (Layer 2)
  - `PrefabHolder` (A Tilemap utilizing Prefab Tiles to natively paint all map asset instances onto the grid, ensuring strict cell resolution.)

## 3. Scale & Pixels-Per-Unit (PPU) Mathematics
The native Unity grid requires macro tiles to seamlessly connect over a `3.0 x 1.5` unit interval. However, the Web App exports standard `280x140px` resolution PNG assets. 
- Using standard `100 PPU` would result in 2.8 unit tiles, creating rendering gaps.
- **The Solution:** The automated C# script intercepts the imported PNG assets and explicitly forces their PPU to `93.33333f` (which is exactly `280 / 3`). 
- **Result:** The 280px tiles physically scale to exactly 3.0 Unity world units, aligning flawlessly with `Gridx3` without distorting or squishing the native Unity grids.

## 4. Coordinate System Mapping (Un-Flipping the Map)
A fundamental mathematical difference exists between standard 2D arrays and Unity's Native Isometric grids (using `XYZ` swizzle).

### The Axis Discrepancy
- **Web App 2D Loop:** `+Col` renders visually **Down-Right**. `+Row` renders visually **Down-Left**.
- **Unity Isometric (XYZ):** `+X` renders visually **Up-Right**. `+Y` renders visually **Up-Left**.

Directly plugging Web App `(Col, Row)` into Unity `(X, Y)` results in the entire map being rotated 90 degrees counter-clockwise and mirroring horizontally. This causes wide sprites to stretch across tall grid spaces, ruining the layout.

### The Mathematical Fix
To map the coordinates perfectly 1:1 without visual flipping or rotation, the C# parser applies negative transposition:
- **`Unity Tile X = -Col`**
- **`Unity Tile Y = -Row`**

This is implemented natively in the parser as:
- **Terrain/Objects:** `new Vector3Int(-(int)item.position.x, (int)item.position.y, 0);` *(where position.y is already negated as `-Row` in the web app export JSON)*.
- **BuildableGrid:** `new Vector3Int(-x, -y, 0);` *(where x is Col and y is Row)*.

## 5. Unity Quirks & C# Implementation Details
The `ApplyMapConfigEditor.cs` manages several Unity-specific API engine quirks:
1. **Strict Null Checking (Fake Nulls):** Avoids using the standard C# `??` null-coalescing operator on Unity Objects. Unity's custom C++ garbage collection wrappers break standard C# null evaluation. `if (comp == null)` is strictly enforced for Grid and Tilemap regeneration to prevent `MissingComponentExceptions`.
2. **Blueprint Prefab Standardization & Prefab Tiles:** Rather than generating naked GameObjects from scratch, the exporter relies on 'Blueprint' templates (e.g., `Blueprint_Mineral`, `Blueprint_Tree`) stored in the Unity project. The web app exporter provides a UI to map generic web assets to these specific blueprint categories. Because the final map requires assets to be painted onto the `PrefabHolder` Tilemap, the C# parser intercepts mappings, duplicates the correct blueprint into a Prefab, and then generates an intermediary `.asset` **Prefab Tile** that can be injected into the Tilemap native API.
3. **Sorting Groups:** Uses `SortingGroup` injection to natively resolve Isometric Z-Depth sorting issues for generated prefabs, sidestepping the need to hardcode `sortingOrder` integers across complex multi-sprite objects.
