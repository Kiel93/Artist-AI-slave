// @ts-nocheck
import JSZip from 'jszip';

const bakeTransformToDataUrl = async (sourceUrl: string, scale: number): Promise<string> => {
  if (!sourceUrl || scale === 1) return sourceUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = img.width * scale;
        const H = img.height * scale;
        if (W <= 0 || H <= 0) {
          resolve(sourceUrl);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, W, H);

        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        console.error("Failed to bake transform", e);
        resolve(sourceUrl);
      }
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
};

const bakeIconToDataUrl = async (sourceUrl: string, targetSize: number): Promise<string> => {
  if (!sourceUrl || targetSize <= 0) return sourceUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = img.width;
        const H = img.height;
        if (W <= 0 || H <= 0) {
          resolve(sourceUrl);
          return;
        }

        const scale = Math.min(targetSize / W, targetSize / H);
        const scaledW = W * scale;
        const scaledH = H * scale;

        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext("2d")!;

        // By default, the canvas is transparent, which matches the user's requirement.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Center the image in the targetSize x targetSize canvas
        const offsetX = (targetSize - scaledW) / 2;
        const offsetY = (targetSize - scaledH) / 2;
        
        ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);

        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        console.error("Failed to bake icon", e);
        resolve(sourceUrl);
      }
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
};

export interface UnityExportParams {
  mapDataRef?: React.MutableRefObject<any>;
  oceanAsset: any;
  groundAsset: any;
  objectAssets: any[];
  decalOverrides: any;
  generatedOceanTiles: Record<string, string>;
  generatedFoamTiles: Record<string, string>;
  exportOcean: boolean;
  exportGround: boolean;
  exportObjects: boolean;
  exportGrid: boolean;
  exportBlueprints: boolean;
  exportIcon: boolean;
  iconResolution: number;
  parameters: any;
}

export async function exportToUnity(params: UnityExportParams): Promise<Blob> {
  const {
    mapDataRef, oceanAsset, groundAsset, objectAssets, decalOverrides,
    generatedOceanTiles, generatedFoamTiles,
    exportOcean, exportGround, exportObjects, exportGrid, exportBlueprints,
    exportIcon, iconResolution, parameters
  } = params;

  try {
      const zip = new JSZip();

      const addDataUrlToZip = async (name: string, url: string, folderPath: string) => {
        let ext = 'png';
        if (!url.startsWith('data:')) {
          const urlExt = url.split('.').pop()?.split('?')[0];
          if (urlExt && urlExt.length <= 10) ext = urlExt;
        }

        if (url.startsWith('data:')) {
          const base64Data = url.split(',')[1];
          if (base64Data) {
            zip.folder(folderPath)?.file(`${name}.${ext}`, base64Data, { base64: true });
            return;
          }
        }

        try {
          const res = await fetch(url);
          const blob = await res.blob();
          zip.folder(folderPath)?.file(`${name}.${ext}`, blob);
        } catch (e) {
          console.error("Failed to fetch", name, e);
        }
      };

      const mapConfig: any = {
        buildableGrid: [] as any[],
        ocean: [] as any[],
        ground: [] as any[],
        objects: [] as any[],
        assetDefinitions: [] as any[]
      };

      const groundSpriteUrls = new Map<string, string>();
      const objectSpriteUrls = new Map<string, { url: string, scale: number }>();

      const gridLevels = mapDataRef?.current?.gridLevels;

      if (gridLevels) {
        // Export Buildable Grid
        if (exportGrid && gridLevels['1']) {
          const buildable: any[] = [];
          const layer1 = gridLevels['1'];
          const h = layer1.length;
          const w = layer1[0].length;
          
          const heightMap: Record<string, number> = {};
          const levels = Object.keys(gridLevels).map(Number).filter(l => !isNaN(l));
          for (const level of levels) {
            const gridLvl = gridLevels[level];
            if (!gridLvl) continue;
            for (let y = 0; y < gridLvl.length; y++) {
              for (let x = 0; x < gridLvl[y].length; x++) {
                if (gridLvl[y][x].isLand) heightMap[`${x},${y}`] = level;
              }
            }
          }

          const checkSubtileBuildable = (cx: number, cy: number, dx: number, dy: number, layer: number) => {
            const hSame = heightMap[`${cx},${cy}`];
            if (hSame !== undefined && hSame > layer) return false;

            const hRight = heightMap[`${cx},${cy - 1}`];
            if (hRight !== undefined && hRight > layer) return false;

            const hUnder = heightMap[`${cx - 1},${cy}`];
            if (hUnder !== undefined && hUnder > layer) return false;

            const hBottomRight = heightMap[`${cx - 1},${cy - 1}`];
            if (hBottomRight !== undefined && hBottomRight > layer) return false;

            const layerGrid = gridLevels[layer];
            if (!layerGrid) return false;
            const isWater = (nx: number, ny: number) => {
              return !layerGrid[ny] || !layerGrid[ny][nx] || !layerGrid[ny][nx].isLand;
            };

            if (dy === 0 && isWater(cx, cy - 1)) return false;
            if (dy === 2 && isWater(cx, cy + 1)) return false;
            if (dx === 0 && isWater(cx - 1, cy)) return false;
            if (dx === 2 && isWater(cx + 1, cy)) return false;

            if (dx === 0 && dy === 0 && isWater(cx - 1, cy - 1)) return false;
            if (dx === 2 && dy === 0 && isWater(cx + 1, cy - 1)) return false;
            if (dx === 0 && dy === 2 && isWater(cx - 1, cy + 1)) return false;
            if (dx === 2 && dy === 2 && isWater(cx + 1, cy + 1)) return false;

            return true;
          };

          for (let row = 0; row < h * 3; row++) {
            const rowData: number[] = [];
            const tileRow = Math.floor(row / 3);
            const dy = row % 3;
            for (let col = 0; col < w * 3; col++) {
              const tileCol = Math.floor(col / 3);
              const dx = col % 3;
              const isLand = layer1[tileRow]?.[tileCol]?.isLand;
              if (!isLand) {
                rowData.push(0);
              } else {
                const isBuildable = checkSubtileBuildable(tileCol, tileRow, dx, dy, 1);
                rowData.push(isBuildable ? 1 : 0);
              }
            }
            buildable.push({ columns: rowData });
          }
          mapConfig.buildableGrid = buildable;
        }

        // Iterate through all layers
        for (const layerStr in gridLevels) {
          const layer = parseInt(layerStr);
          const grid = gridLevels[layerStr];

          for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
              const cell = grid[row][col];

              // Export Ground and Ocean
              if (exportGround && layer >= 0 && (cell.tileId || layer === 0)) {
                const isOcean = layer === 0;
                let finalTileId = (isOcean ? "Ocean_" : "Ground_") + (cell.tileId || '');

                const decal = Object.values(decalOverrides || {}).find((d: any) => {
                  return d.cellX === col && d.cellY === row && d.assetId?.startsWith('ground_variation_');
                }) as any;

                let isProcedural = false;
                let variationUrl = '';

                if (decal) {
                  finalTileId = `${decal.assetId}_lx_${decal.lx}_ly_${decal.ly}`;
                } else if (layer > 0) {
                  // Replicate MapPreview's procedural variation logic
                  const sliceIdx = groundAsset?.slices?.findIndex((s: any) => s.name === ('Ground_' + cell.tileId)) ?? -1;
                  const slice = sliceIdx >= 0 ? groundAsset!.slices[sliceIdx] : undefined;
                  if (slice && slice.variations && slice.variations.length > 0) {
                    const seed = col * 12.9898 + row * 78.233 + layer * 13.1313;
                    const rand = Math.abs(Math.sin(seed) * 43758.5453);
                    let totalFactor = 1;
                    slice.variations.forEach(v => { totalFactor += (v.factor || 0); });
                    if (totalFactor > 0) {
                      let choiceValue = (rand - Math.floor(rand)) * totalFactor;
                      let currentSum = 1;
                      if (choiceValue >= currentSum) {
                        let chosenVar = 0;
                        for (let i = 0; i < slice.variations.length; i++) {
                          currentSum += (slice.variations[i].factor || 0);
                          if (choiceValue < currentSum) {
                            chosenVar = i;
                            break;
                          }
                        }
                        isProcedural = true;
                        finalTileId = `Ground_variation_${sliceIdx}_var_${chosenVar}_lx_0_ly_0`;
                        if (slice.variations[chosenVar].url) {
                          variationUrl = slice.variations[chosenVar].url;
                        }
                      }
                    }
                  }
                }

                const unityX = col;
                const unityY = row;

                const itemData = {
                  id: finalTileId,
                  flip: false,
                  position: { x: unityX, y: unityY },
                  layer: layer
                };

                if (layer === 0) {
                  const layer1Cell = gridLevels['1'] && gridLevels['1'][row] && gridLevels['1'][row][col];
                  const taperTile = (layer1Cell && layer1Cell.taperTile) || cell.taperTile;
                  const taperId = taperTile
                    ? (taperTile.startsWith('Ocean_') ? taperTile : `Ocean_${taperTile}`)
                    : 'Ocean_Flat_Floor';

                  mapConfig.ocean.push({
                    id: taperId,
                    flip: false,
                    position: { x: unityX, y: unityY },
                    layer: layer
                  });

                  if (cell.foamTile) {
                    const foamId = cell.foamTile.startsWith('foam_') || cell.foamTile.startsWith('Foam_')
                      ? `Foam_${cell.foamTile.replace(/^(foam_|Foam_)/, '')}`
                      : `Foam_${cell.foamTile}`;

                    mapConfig.ocean.push({
                      id: foamId,
                      flip: false,
                      position: { x: unityX, y: unityY },
                      layer: layer // Set foam to layer 0 to avoid floating and draw order issues
                    });
                  }
                } else {
                  mapConfig.ground.push(itemData);
                }

                if (layer > 0) {
                  if (decal) {
                    groundSpriteUrls.set(finalTileId, 'PENDING_VARIATION');
                  } else if (isProcedural && variationUrl) {
                    groundSpriteUrls.set(finalTileId, 'PENDING_VARIATION');
                  } else {
                    const slice = groundAsset?.slices?.find(s => s.name === ('Ground_' + cell.tileId));
                    if (slice) {
                      groundSpriteUrls.set(finalTileId, slice.url);
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (exportObjects || exportIcon) {
        if (objectAssets) {
          for (const objAsset of objectAssets) {
            const cleanPrefabName = objAsset.id;
            
            if (objAsset.imageUrl) {
              objectSpriteUrls.set(cleanPrefabName, { url: objAsset.imageUrl, scale: objAsset.scale || 1 });
            }
            if (!mapConfig.assetDefinitions.find((d: any) => d.id === cleanPrefabName)) {
              mapConfig.assetDefinitions.push({
                id: cleanPrefabName,
                scale: objAsset.scale,
                baseTiles: (objAsset.baseTiles || [{ lx: 0, ly: 0 }]).map((t: any) => ({ lx: t.lx, ly: t.ly }))
              });
            }
          }
        }
      }

      if (exportObjects) {
        const objectInstances = mapDataRef?.current?.objectInstances;
        if (objectInstances) {
          for (const obj of objectInstances) {
            const cleanPrefabName = obj.id;

            const unityX = obj.cellX * 3 + (obj.lx || 0);
            const unityY = obj.cellY * 3 + (obj.ly || 0);

            const itemConfig = {
              id: cleanPrefabName,
              flip: false,
              position: { x: unityX, y: unityY },
              lx: obj.lx || 0,
              ly: obj.ly || 0,
              layer: (obj as any).layer || 1
            };

            mapConfig.objects.push(itemConfig);
          }
        }
      }

      // Write JSON
      zip.file('MapConfig.json', JSON.stringify(mapConfig, null, 2));

      // Embed Editor Script
      const csharpScript = `



using UnityEngine;
using UnityEditor;
using System.IO;
using System.Collections.Generic;
using UnityEngine.Tilemaps;

public class ApplyMapConfigEditor : EditorWindow
{
    public TextAsset mapConfigFile;

    private WebMapConfig currentConfig;
    private List<string> missingPrefabs = new List<string>();
    private Dictionary<string, GameObject> blueprintMappings = new Dictionary<string, GameObject>();
    private GameObject defaultBlueprint;
    private Vector2 scrollPos;
    public UnityEditor.SceneAsset templateScene;
    public string mapId = "11";

    private static Dictionary<string, int> prefixMaxNumbers = new Dictionary<string, int>();

    public static string GetNextAutoIncrementName(string prefix)
    {
        if (!prefixMaxNumbers.ContainsKey(prefix))
        {
            string[] guids = AssetDatabase.FindAssets("t:Prefab");
            int maxNum = 0;
            foreach (string guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                string name = System.IO.Path.GetFileNameWithoutExtension(path);
                if (name.StartsWith(prefix))
                {
                    string remainder = name.Substring(prefix.Length);
                    var match = System.Text.RegularExpressions.Regex.Match(remainder, @"^(\\d+)");
                    if (match.Success)
                    {
                        int num = int.Parse(match.Groups[1].Value);
                        if (num > maxNum) maxNum = num;
                    }
                }
            }
            prefixMaxNumbers[prefix] = maxNum;
        }
        
        prefixMaxNumbers[prefix]++;
        return prefix + prefixMaxNumbers[prefix].ToString();
    }

    private Tilemap groundTilemap;
    private Tilemap oceanTilemap;
    private Tilemap foamTilemap;
    private Tilemap buildableGridTilemap;
    private Tilemap prefabHolderTilemap;

    [MenuItem("Tools/Farm Adventure/Apply Map Config Edits", false, 20)]
    public static void ShowWindow()
    {
        GetWindow<ApplyMapConfigEditor>("Apply Map Config");
    }

    public void ForceReload()
    {
        if (mapConfigFile != null)
        {
            LoadConfig();
        }
    }

    private void OnEnable()
    {
        if (defaultBlueprint == null)
        {
            string[] defaultGuids = AssetDatabase.FindAssets("Blueprint_Mineral t:Prefab");
            if (defaultGuids.Length > 0)
            {
                defaultBlueprint = AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(defaultGuids[0]));
            }
        }

        ForceReload();
    }

    private void OnGUI()
    {
        GUILayout.Label("Apply Asset Footprints & Buildable Zone", EditorStyles.boldLabel);
        
        mapId = EditorGUILayout.TextField("Map ID (e.g. 11)", mapId);
        GUILayout.Space(5);

        EditorGUI.BeginChangeCheck();
        EditorGUILayout.BeginHorizontal();
        mapConfigFile = (TextAsset)EditorGUILayout.ObjectField("MapConfig JSON", mapConfigFile, typeof(TextAsset), false);
        if (GUILayout.Button("Reload", GUILayout.Width(60)))
        {
            ForceReload();
        }
        EditorGUILayout.EndHorizontal();
        
        if (EditorGUI.EndChangeCheck() && mapConfigFile != null)
        {
            ForceReload();
        }

        GUILayout.Space(10);
        
        templateScene = (UnityEditor.SceneAsset)EditorGUILayout.ObjectField("Template Map Scene", templateScene, typeof(UnityEditor.SceneAsset), false);
        GUILayout.Label("Template scene provides base elements like Main Camera, Managers, EventSystem, etc.", EditorStyles.miniLabel);

        GUILayout.Space(10);
        
        defaultBlueprint = (GameObject)EditorGUILayout.ObjectField("Default Blueprint (Fallback)", defaultBlueprint, typeof(GameObject), false);
        
        GUILayout.Space(10);
        
        if (missingPrefabs.Count > 0)
        {
            GUILayout.Label("Missing Prefabs Detected (Map to Blueprints)", EditorStyles.boldLabel);
            
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Apply Default to All", GUILayout.Width(130))) {
                foreach (string id in missingPrefabs) {
                    if (defaultBlueprint != null) blueprintMappings[id] = defaultBlueprint;
                }
            }
            EditorGUILayout.EndHorizontal();
            
            EditorGUILayout.Space();
            scrollPos = EditorGUILayout.BeginScrollView(scrollPos, GUILayout.MaxHeight(150));
            foreach (string id in missingPrefabs)
            {
                blueprintMappings[id] = (GameObject)EditorGUILayout.ObjectField(id, blueprintMappings.ContainsKey(id) ? blueprintMappings[id] : null, typeof(GameObject), false);
            }
            EditorGUILayout.EndScrollView();
            GUILayout.Space(10);
        }

        GUILayout.Label("Map Generation uses Auto 'Find and Create' for MAP_11 Hierarchy", EditorStyles.helpBox);
        GUILayout.Space(10);

        if (GUILayout.Button("Apply Edits & Generate Map"))
        {
            if (mapConfigFile != null)
            {
                ApplyEdits(mapConfigFile.text);
            }
        }
    }

    private void LoadConfig()
    {
        currentConfig = JsonUtility.FromJson<WebMapConfig>(mapConfigFile.text);
        missingPrefabs.Clear();
        blueprintMappings.Clear();
        if (currentConfig != null && currentConfig.objects != null)
        {
            string[] defaultGuids = AssetDatabase.FindAssets("Blueprint_Mineral t:Prefab");
            GameObject mineralBlueprint = defaultGuids.Length > 0 ? AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(defaultGuids[0])) : null;

            foreach (var item in currentConfig.objects)
            {
                if (!missingPrefabs.Contains(item.id))
                {
                    string[] prefabGuids = AssetDatabase.FindAssets(item.id + " t:Prefab");
                    bool foundExact = false;
                    foreach (string guid in prefabGuids) {
                        if (System.IO.Path.GetFileNameWithoutExtension(AssetDatabase.GUIDToAssetPath(guid)) == item.id) {
                            foundExact = true;
                            break;
                        }
                    }
                    if (!foundExact)
                    {
                        missingPrefabs.Add(item.id);
                        if (mineralBlueprint != null) {
                            blueprintMappings[item.id] = mineralBlueprint;
                        }
                    }
                }
            }
        }
    }

    private Tilemap GetOrCreateTilemap(GameObject parent, string name, int sortingOrder, string sortingLayerName = "Default")
    {
        Transform child = parent.transform.Find(name);
        GameObject go = child != null ? child.gameObject : new GameObject(name);
        go.transform.SetParent(parent.transform, false);
        
        Tilemap tm = go.GetComponent<Tilemap>();
        if (tm == null) tm = go.AddComponent<Tilemap>();
        
        TilemapRenderer tr = go.GetComponent<TilemapRenderer>();
        if (tr == null) tr = go.AddComponent<TilemapRenderer>();
        
        tr.sortOrder = TilemapRenderer.SortOrder.TopRight;
        tr.sortingOrder = sortingOrder;
        if (!string.IsNullOrEmpty(sortingLayerName) && sortingLayerName != "Default")
        {
            tr.sortingLayerName = sortingLayerName;
        }
        
        return tm;
    }

    private void CopyBaseHierarchyFromTemplate()
    {
        if (templateScene == null) return;

        string templatePath = AssetDatabase.GetAssetPath(templateScene);
        if (string.IsNullOrEmpty(templatePath)) return;

        UnityEngine.SceneManagement.Scene activeScene = UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene();
        if (activeScene.path == templatePath) return; // Z Do not copy from self

        UnityEngine.SceneManagement.Scene tempScene = UnityEditor.SceneManagement.EditorSceneManager.OpenScene(templatePath, UnityEditor.SceneManagement.OpenSceneMode.Additive);
        if (tempScene.IsValid())
        {
            GameObject[] rootObjects = tempScene.GetRootGameObjects();
            foreach (GameObject go in rootObjects)
            {
                // Skip objects generated by the tool or map-specific objects
                bool skip = false;
                string goName = go.name;
                
                // Blacklist of map-specific items that should not be copied to a new map
                if (goName.StartsWith("Background_") || 
                    goName.Contains("Cloud") || 
                    goName == "CameraRender" || 
                    goName == "TargetPathFinder" ||
                    goName == "Cupid" || goName == "Frank") 
                {
                    skip = true;
                }
                else
                {
                    // Skip if active scene already has an object with this exact name
                    foreach (GameObject activeGo in activeScene.GetRootGameObjects())
                    {
                        if (activeGo.name == goName)
                        {
                            skip = true;
                            break;
                        }
                    }
                }

                if (skip)
                {
                    DestroyImmediate(go);
                }
                else if (goName == "Grid" || goName == "Gridx3")
                {
                    // Keep Grids to preserve components like GridBuildSystem, but clear all tiles and children
                    UnityEngine.Tilemaps.Tilemap[] tilemaps = go.GetComponentsInChildren<UnityEngine.Tilemaps.Tilemap>(true);
                    foreach (var tm in tilemaps)
                    {
                        tm.ClearAllTiles();
                    }

                    // Clear all instantiated objects inside any child layer of Grid/Gridx3 (e.g. inside BuildingObject, Farm, PrefabHolder)
                    foreach (Transform child in go.transform)
                    {
                        for (int i = child.childCount - 1; i >= 0; i--)
                        {
                            DestroyImmediate(child.GetChild(i).gameObject);
                        }
                    }
                }
                else if (goName == "TutorialController")
                {
                    // Clean up map-specific clouds from TutorialController
                    for (int i = go.transform.childCount - 1; i >= 0; i--)
                    {
                        Transform child = go.transform.GetChild(i);
                        if (child.name != "TutCanvas" && child.name != "CloudTut_1")
                        {
                            DestroyImmediate(child.gameObject);
                        }
                    }
                }
            }
            UnityEngine.SceneManagement.SceneManager.MergeScenes(tempScene, activeScene);
        }
    }

    private void SetupHierarchies()
    {
        // 1. Gridx3 (Macro Grid)
        GameObject gridX3Obj = GameObject.Find("Gridx3");
        if (gridX3Obj == null)
        {
            gridX3Obj = new GameObject("Gridx3");
            Grid gridX3 = gridX3Obj.AddComponent<Grid>();
            gridX3.cellLayout = GridLayout.CellLayout.Isometric;
            gridX3.cellSize = new Vector3(3.0f, 1.5f, 1.0f);
        }

        oceanTilemap = GetOrCreateTilemap(gridX3Obj, "Ocean", -1);
        foamTilemap = GetOrCreateTilemap(gridX3Obj, "Foam", 0);
        groundTilemap = GetOrCreateTilemap(gridX3Obj, "Ground", 1);

        TilemapRenderer groundRenderer = groundTilemap.GetComponent<TilemapRenderer>();
        if (groundRenderer != null)
        {
            // FINETUNING: Set renderer mode to Individual to fix depth sorting between overlapping macro tiles
            groundRenderer.mode = TilemapRenderer.Mode.Individual;
        }

        // 2. Grid (Micro Grid)
        GameObject gridObj = GameObject.Find("Grid");
        if (gridObj == null)
        {
            gridObj = new GameObject("Grid");
            Grid grid = gridObj.AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.IsometricZAsY;
            grid.cellSize = new Vector3(1.0f, 0.5f, 1.0f);
        }

        // Find existing Buildable tilemap under Grid
        Transform buildableTransform = gridObj.transform.Find("Buildable");
        if (buildableTransform != null)
        {
            buildableGridTilemap = buildableTransform.GetComponent<Tilemap>();
        }
        if (buildableGridTilemap == null)
        {
            buildableGridTilemap = GetOrCreateTilemap(gridObj, "Buildable", 2);
        }
        prefabHolderTilemap = GetOrCreateTilemap(gridObj, "PrefabHolder", 0, "Foreground");
    }

    private void ApplyEdits(string json)
    {
        WebMapConfig config = JsonUtility.FromJson<WebMapConfig>(json);
        if (config == null) return;

        CopyBaseHierarchyFromTemplate();
        SetupHierarchies();

        // 1. Apply Footprints and Scale to Prefabs
        if (config.assetDefinitions != null)
        {
            string[] prefabGuids = AssetDatabase.FindAssets("t:Prefab");
            foreach (string guid in prefabGuids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab != null)
                {
                    WebAssetDef def = config.assetDefinitions.Find(d => d.id == prefab.name);
                    if (def != null)
                    {
                        GridObject go = prefab.GetComponent<GridObject>();
                        if (go != null)
                        {
                            int minX = 0, maxX = 0, minY = 0, maxY = 0;
                            foreach (var bt in def.baseTiles)
                            {
                                if (bt.lx < minX) minX = bt.lx;
                                if (bt.lx > maxX) maxX = bt.lx;
                                if (bt.ly < minY) minY = bt.ly;
                                if (bt.ly > maxY) maxY = bt.ly;
                            }
                            go.area.position = new Vector2Int(minX, minY);
                            go.area.size = new Vector2Int(maxX - minX + 1, maxY - minY + 1);
                        }
                        
                        EditorUtility.SetDirty(prefab);
                        PrefabUtility.SavePrefabAsset(prefab);
                    }
                }
            }
        }

        // 2. Build Buildable Zone
        if (config.buildableGrid != null && config.buildableGrid.Count > 0 && buildableGridTilemap != null)
        {
            buildableGridTilemap.ClearAllTiles();
            
            // Use existing Moveable tile from TileMap/Tiles/Movement
            TileBase buildableTileBase = AssetDatabase.LoadAssetAtPath<TileBase>("Assets/TileMap/Tiles/Movement/Moveable.asset");
            if (buildableTileBase == null)
            {
                // Fallback: search by name
                string[] tileGuids = AssetDatabase.FindAssets("Moveable t:Tile");
                if (tileGuids.Length > 0) buildableTileBase = AssetDatabase.LoadAssetAtPath<TileBase>(AssetDatabase.GUIDToAssetPath(tileGuids[0]));
            }
            
            if (buildableTileBase == null)
            {
                Debug.LogError("[ApplyMapConfig] Cannot find 'Moveable' tile at Assets/TileMap/Tiles/Movement/Moveable.asset! Buildable grid will not be painted.");
            }

            if (buildableTileBase != null) {
                int height = config.buildableGrid.Count;
                int paintedCount = 0;
                for (int y = 0; y < height; y++)
                {
                    int width = config.buildableGrid[y].columns.Count;
                    for (int x = 0; x < width; x++)
                    {
                        if (config.buildableGrid[y].columns[x] == 1)
                        {
                            Vector3Int pos = new Vector3Int(x, y, 0);
                            buildableGridTilemap.SetTile(pos, buildableTileBase);
                            paintedCount++;
                        }
                    }
                }
                Debug.Log($"[ApplyMapConfig] Painted {paintedCount} buildable subtiles onto Grid/Buildable tilemap.");
            }
        }

        // 3. Build Ground, Ocean and Foam
        if (groundTilemap != null) groundTilemap.ClearAllTiles();
        if (oceanTilemap != null) oceanTilemap.ClearAllTiles();
        if (foamTilemap != null) foamTilemap.ClearAllTiles();

        Dictionary<string, Tile> tileCache = new Dictionary<string, Tile>();
        List<WebMapItem> allTiles = new List<WebMapItem>();
        if (config.ocean != null) allTiles.AddRange(config.ocean);
        if (config.ground != null) allTiles.AddRange(config.ground);

        FixImportSettings(allTiles);

        foreach (var item in allTiles)
        {
            if (!tileCache.TryGetValue(item.id, out Tile tile))
            {
                string[] guids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                foreach (string guid in guids)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                    if (s != null && s.name == item.id)
                    {
                        tile = ScriptableObject.CreateInstance<Tile>();
                        tile.sprite = s;
                        break;
                    }
                }
                tileCache[item.id] = tile;
            }

            if (tile != null)
            {
                Vector3Int pos = new Vector3Int(item.position.x, item.position.y, 0);
                if (item.id.StartsWith("Foam_") && foamTilemap != null) {
                    foamTilemap.SetTile(pos, tile);
                } else if (item.id.StartsWith("Ocean_") && oceanTilemap != null) {
                    oceanTilemap.SetTile(pos, tile);
                } else if (groundTilemap != null) {
                    groundTilemap.SetTile(pos, tile);
                }
            }
        }

        // 4. Build Objects
        if (prefabHolderTilemap != null)
        {
            prefabHolderTilemap.ClearAllTiles();

            List<WebMapItem> allObjects = new List<WebMapItem>();
            if (config.objects != null) allObjects.AddRange(config.objects);

            Dictionary<string, GameObject> prefabCache = new Dictionary<string, GameObject>();

            foreach (var item in allObjects)
            {
                GameObject prefab = null;
                if (prefabCache.ContainsKey(item.id))
                {
                    prefab = prefabCache[item.id];
                }
                else
                {
                    string[] prefabGuids = AssetDatabase.FindAssets(item.id + " t:Prefab");
                    string exactPath = null;
                    foreach (string guid in prefabGuids) {
                        string p = AssetDatabase.GUIDToAssetPath(guid);
                        if (System.IO.Path.GetFileNameWithoutExtension(p) == item.id) {
                            exactPath = p;
                            break;
                        }
                    }
                    if (exactPath != null)
                    {
                        prefab = AssetDatabase.LoadAssetAtPath<GameObject>(exactPath);
                    }
                    else if ((blueprintMappings.ContainsKey(item.id) && blueprintMappings[item.id] != null) || defaultBlueprint != null)
                    {
                        GameObject blueprintTemplate = blueprintMappings.ContainsKey(item.id) && blueprintMappings[item.id] != null ? blueprintMappings[item.id] : defaultBlueprint;
                        
                        string[] spriteGuids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                        
                        if (spriteGuids.Length == 0)
                        {
                            string[] texGuids = AssetDatabase.FindAssets(item.id + " t:Texture2D");
                            if (texGuids.Length > 0)
                            {
                                string texPath = AssetDatabase.GUIDToAssetPath(texGuids[0]);
                                TextureImporter texImporter = AssetImporter.GetAtPath(texPath) as TextureImporter;
                                if (texImporter != null)
                                {
                                    texImporter.textureType = TextureImporterType.Sprite;
                                    texImporter.spriteImportMode = SpriteImportMode.Single;
                                    var settings = new TextureImporterSettings();
                                    texImporter.ReadTextureSettings(settings);
                                    settings.spriteAlignment = (int)SpriteAlignment.BottomCenter;
                                    texImporter.SetTextureSettings(settings);
                                    
                                    string[] gGuids = AssetDatabase.FindAssets("Ground_ t:Sprite");
                                    if (gGuids.Length > 0) {
                                        TextureImporter gImp = AssetImporter.GetAtPath(AssetDatabase.GUIDToAssetPath(gGuids[0])) as TextureImporter;
                                        if (gImp != null) texImporter.spritePixelsPerUnit = gImp.spritePixelsPerUnit;
                                    }
                                    
                                    EditorUtility.SetDirty(texImporter);
                                    texImporter.SaveAndReimport();
                                    spriteGuids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                                }
                            }
                        }

                        if (spriteGuids.Length > 0)
                        {
                            string spritePath = AssetDatabase.GUIDToAssetPath(spriteGuids[0]);
                            Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(spritePath);
                            if (s != null)
                            {
                                string finalName = item.id;
                                
                                // ID is just item.id since Rename Tool handles the auto-increment naming now.

                                GameObject cloned = (GameObject)PrefabUtility.InstantiatePrefab(blueprintTemplate);
                                
                                SpriteRenderer sr = cloned.GetComponentInChildren<SpriteRenderer>();
                                if (sr == null) sr = cloned.AddComponent<SpriteRenderer>();
                                sr.sprite = s;

                                // Update Id property on any script (like Mineral)
                                MonoBehaviour[] monos = cloned.GetComponentsInChildren<MonoBehaviour>();
                                foreach (var mono in monos)
                                {
                                    if (mono == null) continue;
                                    SerializedObject so = new SerializedObject(mono);
                                    SerializedProperty idProp = so.FindProperty("Id");
                                    if (idProp == null) idProp = so.FindProperty("id");
                                    
                                    if (idProp != null && idProp.propertyType == SerializedPropertyType.String)
                                    {
                                        idProp.stringValue = finalName;
                                        so.ApplyModifiedProperties();
                                    }
                                }
                                
                                string prefabFolder = $"Assets/Prefabs/Gameplay/Mineral/Map_{mapId}";
                                if (finalName.StartsWith("b_")) prefabFolder = $"Assets/Prefabs/Gameplay/Building/Map_{mapId}";
                                else if (finalName.StartsWith("ob_")) prefabFolder = $"Assets/Prefabs/Gameplay/Obstacle/Map_{mapId}";
                                
                                string[] folders = prefabFolder.Split('/');
                                string currentPath = folders[0];
                                for (int i = 1; i < folders.Length; i++)
                                {
                                    if (!AssetDatabase.IsValidFolder(currentPath + "/" + folders[i]))
                                    {
                                        AssetDatabase.CreateFolder(currentPath, folders[i]);
                                    }
                                    currentPath += "/" + folders[i];
                                }
                                
                                WebAssetDef def = config.assetDefinitions.Find(d => d.id == finalName);
                                if (def != null)
                                {
                                    GridObject go = cloned.GetComponent<GridObject>();
                                    if (go != null)
                                    {
                                        int minX = 0, maxX = 0, minY = 0, maxY = 0;
                                        foreach (var bt in def.baseTiles)
                                        {
                                            if (bt.lx < minX) minX = bt.lx;
                                            if (bt.lx > maxX) maxX = bt.lx;
                                            if (bt.ly < minY) minY = bt.ly;
                                            if (bt.ly > maxY) maxY = bt.ly;
                                        }
                                        go.area.position = new Vector2Int(minX, minY);
                                        go.area.size = new Vector2Int(maxX - minX + 1, maxY - minY + 1);
                                    }
                                }

                                prefab = PrefabUtility.SaveAsPrefabAsset(cloned, prefabFolder + "/" + finalName + ".prefab");
                                DestroyImmediate(cloned);
                                
                                missingPrefabs.Remove(item.id);
                            }
                        }
                    }
                    
                    if (prefab != null)
                    {
                        prefabCache[item.id] = prefab;
                    }
                }

                if (prefab != null)
                {
                    if (!item.id.StartsWith("b_"))
                    {
                        string tilePath = $"Assets/MapEditor/Editor/Tiles/Mineral/Map_{mapId}";
                        if (item.id.StartsWith("ob_")) tilePath = $"Assets/MapEditor/Editor/Tiles/Obstacle/Map_{mapId}";

                        string[] tFolders = tilePath.Split('/');
                        string currentTPath = tFolders[0];
                        for (int i = 1; i < tFolders.Length; i++)
                        {
                            if (!AssetDatabase.IsValidFolder(currentTPath + "/" + tFolders[i]))
                            {
                                AssetDatabase.CreateFolder(currentTPath, tFolders[i]);
                            }
                            currentTPath += "/" + tFolders[i];
                        }

                        string assetPath = tilePath + "/" + prefab.name + ".asset";
                        Tile prefabTile = AssetDatabase.LoadAssetAtPath<Tile>(assetPath);
                        
                        // Extract sprite from prefab's SpriteRenderer
                        Sprite prefabSprite = null;
                        SpriteRenderer sr = prefab.GetComponentInChildren<SpriteRenderer>();
                        if (sr != null && sr.sprite != null)
                        {
                            prefabSprite = sr.sprite;
                        }
                        else
                        {
                            // Fallback: try to find sprite asset with same name
                            string[] sprGuids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                            foreach (string sg in sprGuids)
                            {
                                string sp = AssetDatabase.GUIDToAssetPath(sg);
                                Sprite candidate = AssetDatabase.LoadAssetAtPath<Sprite>(sp);
                                if (candidate != null && candidate.name == item.id)
                                {
                                    prefabSprite = candidate;
                                    break;
                                }
                            }
                        }
                        
                        if (prefabTile == null)
                        {
                            prefabTile = ScriptableObject.CreateInstance<Tile>();
                            prefabTile.gameObject = prefab;
                            prefabTile.sprite = prefabSprite;
                            AssetDatabase.CreateAsset(prefabTile, assetPath);
                        }
                        else
                        {
                            bool dirty = false;
                            if (prefabTile.gameObject != prefab)
                            {
                                prefabTile.gameObject = prefab;
                                dirty = true;
                            }
                            if (prefabTile.sprite == null && prefabSprite != null)
                            {
                                prefabTile.sprite = prefabSprite;
                                dirty = true;
                            }
                            if (dirty)
                            {
                                EditorUtility.SetDirty(prefabTile);
                                AssetDatabase.SaveAssets();
                            }
                        }
                    }

                    Vector3Int pos = new Vector3Int(item.position.x, item.position.y, 0);
                    
                    // Instantiate direct to GameObject instead of Tile!
                    Transform targetHolder = prefabHolderTilemap.transform;
                    if (item.id.StartsWith("b_"))
                    {
                        GameObject holder = GameObject.Find("Grid/BuildingObject");
                        if (holder != null) targetHolder = holder.transform;
                    }
                    else if (item.id.StartsWith("f_") || item.id.StartsWith("Farm"))
                    {
                        GameObject holder = GameObject.Find("Grid/Farm");
                        if (holder != null) targetHolder = holder.transform;
                    }

                    GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, targetHolder);
                    if (instance != null)
                    {
                        instance.transform.position = prefabHolderTilemap.CellToWorld(pos);

                        if (item.flip)
                        {
                            SpriteRenderer sr = instance.GetComponentInChildren<SpriteRenderer>();
                            if (sr != null) sr.transform.localScale = new Vector3(-1, 1, 1);

                            Mineral mineral = instance.GetComponent<Mineral>();
                            if (mineral != null)
                            {
                                Vector2Int origSize = mineral.area.size;
                                mineral.area.size = new Vector2Int(origSize.y, origSize.x);
                                EditorUtility.SetDirty(mineral);
                            }
                        }
                    }
                }
            }
        }

        UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(UnityEngine.SceneManagement.SceneManager.GetActiveScene());
        Debug.Log("Successfully applied map config edits and generated island!");
    }

    private void FixImportSettings(List<WebMapItem> allTiles)
    {
        Sprite referenceSprite = null;
        TextureImporter refImporter = null;

        // 1. Find a valid ground sprite to act as reference
        foreach (var item in allTiles)
        {
            if (item.id.StartsWith("Ground_") && !item.id.StartsWith("Ground_variation_"))
            {
                string[] guids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                foreach (string guid in guids)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                    if (s != null && s.name == item.id)
                    {
                        refImporter = AssetImporter.GetAtPath(path) as TextureImporter;
                        if (refImporter != null) {
                            referenceSprite = s;
                            break;
                        }
                    }
                }
                if (refImporter != null) break;
            }
        }

        if (refImporter == null) return;

        // 2. Apply settings to all generated sprites
        bool refreshNeeded = false;
        foreach (var item in allTiles)
        {
            if (item.id.StartsWith("Ocean_") || item.id.StartsWith("Foam_") || item.id.StartsWith("Ground_"))
            {
                string[] guids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                if (guids.Length == 0)
                {
                    string[] texGuids = AssetDatabase.FindAssets(item.id + " t:Texture2D");
                    if (texGuids.Length > 0)
                    {
                        string texPath = AssetDatabase.GUIDToAssetPath(texGuids[0]);
                        TextureImporter texImporter = AssetImporter.GetAtPath(texPath) as TextureImporter;
                        if (texImporter != null)
                        {
                            texImporter.textureType = TextureImporterType.Sprite;
                            texImporter.spriteImportMode = SpriteImportMode.Single;
                            
                            var settings = new TextureImporterSettings();
                            texImporter.ReadTextureSettings(settings);
                            var refSettings = new TextureImporterSettings();
                            refImporter.ReadTextureSettings(refSettings);
                            
                            if (item.id.StartsWith("Ocean_") || item.id.StartsWith("Foam_"))
                            {
                                settings.spriteAlignment = (int)SpriteAlignment.Center;
                                settings.spritePivot = new Vector2(0.5f, 0.5f);
                            }
                            else
                            {
                                settings.spriteAlignment = refSettings.spriteAlignment;
                                settings.spritePivot = refSettings.spritePivot;
                            }
                            // FINETUNING: Enforce 93.(3) PPU for macro tiles
                            texImporter.spritePixelsPerUnit = 93.33333f;
                            
                            texImporter.SetTextureSettings(settings);
                            EditorUtility.SetDirty(texImporter);
                            texImporter.SaveAndReimport();
                            refreshNeeded = true;
                            
                            guids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                        }
                    }
                }
                foreach (string guid in guids)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                    if (s != null && s.name == item.id)
                    {
                        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
                        if (importer != null)
                        {
                            bool changed = false;
                            // FINETUNING: Enforce 93.(3) PPU for macro tiles
                            if (Mathf.Abs(importer.spritePixelsPerUnit - 93.33333f) > 0.01f) { 
                                importer.spritePixelsPerUnit = 93.33333f; 
                                changed = true; 
                            }
                            if (importer.spriteImportMode != refImporter.spriteImportMode) { 
                                importer.spriteImportMode = refImporter.spriteImportMode; 
                                changed = true; 
                            }
                            
                            var settings = new TextureImporterSettings();
                            importer.ReadTextureSettings(settings);
                            var refSettings = new TextureImporterSettings();
                            refImporter.ReadTextureSettings(refSettings);
                            
                            if (item.id.StartsWith("Ocean_") || item.id.StartsWith("Foam_"))
                            {
                                if (settings.spriteAlignment != (int)SpriteAlignment.Center || settings.spritePivot != new Vector2(0.5f, 0.5f))
                                {
                                    settings.spriteAlignment = (int)SpriteAlignment.Center;
                                    settings.spritePivot = new Vector2(0.5f, 0.5f);
                                    importer.SetTextureSettings(settings);
                                    changed = true;
                                }
                            }
                            else
                            {
                                if (settings.spriteAlignment != refSettings.spriteAlignment || settings.spritePivot != refSettings.spritePivot)
                                {
                                    settings.spriteAlignment = refSettings.spriteAlignment;
                                    settings.spritePivot = refSettings.spritePivot;
                                    importer.SetTextureSettings(settings);
                                    changed = true;
                                }
                            }

                            if (changed)
                            {
                                EditorUtility.SetDirty(importer);
                                importer.SaveAndReimport();
                                refreshNeeded = true;
                            }
                        }
                    }
                }
            }
        }
        
        if (refreshNeeded)
        {
            AssetDatabase.Refresh();
        }
    }
}

public class RenameMapTexturesEditor : EditorWindow
{
    private DefaultAsset targetFolder;
    public TextAsset mapConfigFile;
    private Vector2 scrollPos;

    private class InvalidAsset
    {
        public string assetPath;
        public string currentName;
        public int selectedPrefixIndex;
    }

    private List<InvalidAsset> invalidAssets = new List<InvalidAsset>();
    private string[] prefixOptions = new string[] { "None", "r_", "b_", "ob_", "f_", "Ground_", "Ocean_", "Foam_", "Farm_" };

    [MenuItem("Tools/Farm Adventure/Rename Map Textures", false, 10)]
    public static void ShowWindow()
    {
        GetWindow<RenameMapTexturesEditor>("Rename Map Textures");
    }

    private void OnGUI()
    {
        GUILayout.Label("Rename Map Textures", EditorStyles.boldLabel);
        
        targetFolder = (DefaultAsset)EditorGUILayout.ObjectField("Target Folder", targetFolder, typeof(DefaultAsset), false);
        mapConfigFile = (TextAsset)EditorGUILayout.ObjectField("MapConfig JSON (Optional)", mapConfigFile, typeof(TextAsset), false);

        if (GUILayout.Button("Scan Folder"))
        {
            ScanFolder();
        }

        if (invalidAssets.Count > 0)
        {
            GUILayout.Space(10);
            GUILayout.Label("Files missing valid prefixes:", EditorStyles.boldLabel);
            
            scrollPos = EditorGUILayout.BeginScrollView(scrollPos);
            
            for (int i = 0; i < invalidAssets.Count; i++)
            {
                EditorGUILayout.BeginHorizontal();
                GUILayout.Label(invalidAssets[i].currentName, GUILayout.Width(250));
                invalidAssets[i].selectedPrefixIndex = EditorGUILayout.Popup(invalidAssets[i].selectedPrefixIndex, prefixOptions);
                EditorGUILayout.EndHorizontal();
            }
            
            EditorGUILayout.EndScrollView();

            GUILayout.Space(10);
            if (GUILayout.Button("Apply Rename"))
            {
                ApplyRename();
            }
        }
        else if (targetFolder != null)
        {
            GUILayout.Space(10);
            GUILayout.Label("All textures in folder have valid prefixes!", EditorStyles.helpBox);
        }
    }

    private void ScanFolder()
    {
        invalidAssets.Clear();
        if (targetFolder == null) return;

        string folderPath = AssetDatabase.GetAssetPath(targetFolder);
        string[] guids = AssetDatabase.FindAssets("t:Texture2D", new string[] { folderPath });

        foreach (string guid in guids)
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            string fileName = Path.GetFileNameWithoutExtension(path);

            bool isValid = false;
            foreach (string prefix in prefixOptions)
            {
                if (prefix == "None") continue;
                if (fileName.StartsWith(prefix))
                {
                    isValid = true;
                    break;
                }
            }

            if (!isValid)
            {
                invalidAssets.Add(new InvalidAsset {
                    assetPath = path,
                    currentName = fileName,
                    selectedPrefixIndex = 0
                });
            }
        }
    }

    private void ApplyRename()
    {
        AssetDatabase.StartAssetEditing();
        
        string jsonContent = null;
        string jsonPath = null;
        if (mapConfigFile != null)
        {
            jsonPath = AssetDatabase.GetAssetPath(mapConfigFile);
            jsonContent = System.IO.File.ReadAllText(jsonPath);
        }

        foreach (var asset in invalidAssets)
        {
            if (asset.selectedPrefixIndex > 0)
            {
                string prefix = prefixOptions[asset.selectedPrefixIndex];
                
                string newName = ApplyMapConfigEditor.GetNextAutoIncrementName(prefix);
                
                AssetDatabase.RenameAsset(asset.assetPath, newName);
                
                if (jsonContent != null)
                {
                    // Basic string replacement for JSON
                    jsonContent = jsonContent.Replace("\\"id\\":\\"" + asset.currentName + "\\"", "\\"id\\":\\"" + newName + "\\"");
                    jsonContent = jsonContent.Replace("\\"id\\": \\"" + asset.currentName + "\\"", "\\"id\\": \\"" + newName + "\\"");
                }
            }
        }
        AssetDatabase.StopAssetEditing();
        AssetDatabase.SaveAssets();
        
        if (jsonContent != null && jsonPath != null)
        {
            System.IO.File.WriteAllText(jsonPath, jsonContent);
            EditorUtility.SetDirty(mapConfigFile);
        }
        
        AssetDatabase.Refresh();
        
        ApplyMapConfigEditor applyWindow = GetWindow<ApplyMapConfigEditor>("Apply Map Config", false);
        if (applyWindow != null) {
            applyWindow.ForceReload();
        }
        
        ScanFolder();
    }
}

[System.Serializable]
public class WebMapConfig
{
    public List<WebAssetDef> assetDefinitions;
    public List<WebGridRow> buildableGrid;
    public List<WebMapItem> ocean;
    public List<WebMapItem> ground;
    public List<WebMapItem> objects;
}

[System.Serializable]
public class WebMapItem
{
    public string id;
    public bool flip;
    public WebPosition position;
    public int lx;
    public int ly;
    public int layer;
}

[System.Serializable]
public class WebPosition
{
    public int x;
    public int y;
}

[System.Serializable]
public class WebAssetDef
{
    public string id;
    public float scale;
    public List<WebBaseTile> baseTiles;
}

[System.Serializable]
public class WebBaseTile
{
    public int lx;
    public int ly;
}

[System.Serializable]
public class WebGridRow
{
    public List<int> columns;
}



`;
      zip.file('Editor/ApplyMapConfigEditor.cs', csharpScript);

      // Fetch all sprites
      const promises: Promise<any>[] = [];

      if (exportGround) {
        // Add all generated ocean tiles
        if (oceanAsset && oceanAsset.slices.length > 0) {
          promises.push(addDataUrlToZip(`Ocean_Flat_Floor`, oceanAsset.slices[0].url, 'Textures/Ground'));
        }
        for (const [name, url] of Object.entries(generatedOceanTiles)) {
          const exportName = name.startsWith('Ocean_') ? name : `Ocean_${name}`;
          promises.push(addDataUrlToZip(exportName, url, 'Textures/Ground'));
        }
        for (const [name, url] of Object.entries(generatedFoamTiles)) {
          const exportName = name.startsWith('Foam_') || name.startsWith('foam_') ? `Foam_${name.replace(/^(foam_|Foam_)/, '')}` : `Foam_${name}`;
          promises.push(addDataUrlToZip(exportName, url, 'Textures/Ground'));
        }

        for (const [id, url] of Array.from(groundSpriteUrls.entries())) {
          if (url === 'PENDING_VARIATION') {
            promises.push((async () => {
              const match = id.match(/ground_variation_(\d+)_var_(\d+)_lx_(-?\d+)_ly_(-?\d+)/i);
              if (match && groundAsset && groundAsset.slices) {
                const sliceIdx = parseInt(match[1]);
                const vIdx = parseInt(match[2]);
                const lx = parseInt(match[3]);
                const ly = parseInt(match[4]);
                const slice = groundAsset.slices[sliceIdx];
                const v = slice.variations?.[vIdx];
                if (slice && v) {
                  const dataUrl = await new Promise<string>((resolve) => {
                    const origImg = new Image();
                    origImg.crossOrigin = 'anonymous';
                    origImg.onload = () => {
                      const varImg = new Image();
                      varImg.crossOrigin = 'anonymous';
                      varImg.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = origImg.width;
                        canvas.height = origImg.height;
                        const ctx = canvas.getContext('2d')!;

                        const maskCanvas = document.createElement('canvas');
                        maskCanvas.width = origImg.width;
                        maskCanvas.height = origImg.height;
                        const maskCtx = maskCanvas.getContext('2d')!;

                        const anchorX = origImg.width / 2;
                        const anchorY = origImg.height / 4;

                        // Calculate exact isometric sub-tile offset
                        const slotIsoX = (lx - ly) * (140 / 3);
                        const slotIsoY = (lx + ly) * (70 / 3);

                        const smoothing = v.seamSmoothing ?? 0;
                        if (smoothing > 0) maskCtx.filter = `blur(${smoothing / 10}px)`;
                        const scale = Math.max(0.1, 1 - (smoothing / 1000));

                        maskCtx.translate(anchorX + slotIsoX, anchorY + slotIsoY);
                        maskCtx.scale(scale, scale);

                        maskCtx.beginPath();
                        maskCtx.moveTo(0, -origImg.height / 4);
                        maskCtx.lineTo(origImg.width / 2, 0);
                        maskCtx.lineTo(0, origImg.height / 4);
                        maskCtx.lineTo(-origImg.width / 2, 0);
                        maskCtx.closePath();
                        maskCtx.fillStyle = 'black';
                        maskCtx.fill();

                        maskCtx.setTransform(1, 0, 0, 1, 0, 0);
                        maskCtx.filter = 'none';
                        maskCtx.globalCompositeOperation = 'source-in';
                        maskCtx.drawImage(varImg, anchorX + slotIsoX - origImg.width / 2, anchorY + slotIsoY - origImg.height / 4);

                        ctx.drawImage(origImg, 0, 0);
                        ctx.globalAlpha = v.opacity ?? 1;
                        ctx.drawImage(maskCanvas, 0, 0);

                        resolve(canvas.toDataURL('image/png'));
                      };
                      varImg.onerror = () => resolve(slice.url);
                      varImg.src = v.url;
                    };
                    origImg.onerror = () => resolve('');
                    // Use CenterFill as the base to ensure the whole tile (with dirt) is underneath
                    const centerFillUrl = groundAsset.slices.find(s => s.name === 'Ground_CenterFill')?.url;
                    origImg.src = centerFillUrl || slice.url;
                  });
                  await addDataUrlToZip(id, dataUrl, 'Textures/Ground');
                }
              }
            })());
          } else {
            promises.push(addDataUrlToZip(id, url, 'Textures/Ground'));
          }
        }
      }

      if (exportObjects) {
        for (const [id, data] of Array.from(objectSpriteUrls.entries())) {
          if (data.scale !== 1) {
            try {
              // Wait for it because canvas draw is async
              const scaledUrl = await bakeTransformToDataUrl(data.url, data.scale);
              promises.push(addDataUrlToZip(id, scaledUrl, 'Textures/Objects'));
            } catch (e) {
              promises.push(addDataUrlToZip(id, data.url, 'Textures/Objects'));
            }
          } else {
            promises.push(addDataUrlToZip(id, data.url, 'Textures/Objects'));
          }
        }
      }

      if (exportIcon) {
        for (const [id, data] of Array.from(objectSpriteUrls.entries())) {
          try {
            const iconUrl = await bakeIconToDataUrl(data.url, iconResolution || 128);
            promises.push(addDataUrlToZip(id, iconUrl, 'Textures/Icons'));
          } catch (e) {
            console.error(`Failed to export icon for ${id}`, e);
            promises.push(addDataUrlToZip(id, data.url, 'Textures/Icons'));
          }
        }
      }

      if (exportOcean && oceanAsset) {
        if (oceanAsset.slices.length > 0) {
          promises.push(addDataUrlToZip('Ocean_Flat_Floor', oceanAsset.slices[0].url, 'Textures/Ocean'));
        }
        for (const [name, url] of Object.entries(generatedOceanTiles)) {
          const exportName = name.startsWith('Ocean_') ? name : `Ocean_${name}`;
          promises.push(addDataUrlToZip(exportName, url, 'Textures/Ocean'));
        }
        if (parameters.oceanAddFoam) {
          for (const [name, url] of Object.entries(generatedFoamTiles)) {
            const exportName = name.startsWith('foam_') || name.startsWith('Foam_')
              ? `Foam_${name.replace(/^(foam_|Foam_)/, '')}`
              : `Foam_${name}`;
            promises.push(addDataUrlToZip(exportName, url, 'Textures/Ocean'));
          }
        }
      }

      if (exportBlueprints) {
        const blueprints = [
          'Blueprint_Building.prefab',
          'Blueprint_Cloud.prefab',
          'Blueprint_Decoration.prefab',
          'Blueprint_Mineral.prefab',
          'Blueprint_Tree.prefab'
        ];
        for (const bp of blueprints) {
          promises.push(addDataUrlToZip(bp.replace('.prefab', ''), `/assets/blueprints/${bp}`, 'Prefabs/Blueprints'));
        }
      }

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });

      return content;
    } catch (err) {
      console.error("Unity export failed", err);
      throw err;
    }
}
