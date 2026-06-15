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
  parameters: any;
}

export async function exportToUnity(params: UnityExportParams): Promise<Blob> {
  const {
    mapDataRef, oceanAsset, groundAsset, objectAssets, decalOverrides,
    generatedOceanTiles, generatedFoamTiles,
    exportOcean, exportGround, exportObjects, exportGrid, exportBlueprints, parameters
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

          for (let row = 0; row < h * 3; row++) {
            const rowData: number[] = [];
            const tileRow = Math.floor(row / 3);
            for (let col = 0; col < w * 3; col++) {
              const tileCol = Math.floor(col / 3);
              const isLand = layer1[tileRow]?.[tileCol]?.isLand;
              rowData.push(isLand ? 1 : 0);
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

      const objectInstances = mapDataRef?.current?.objectInstances;
      if (exportObjects && objectInstances) {
        for (const obj of objectInstances) {
          const objAsset = objectAssets?.find(a => a.id === obj.id);
          const prefabName = objAsset?.name || objAsset?.nodePrompt || obj.id;
          const cleanPrefabName = prefabName.replace(/\s+/g, '_');

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

          if (objAsset) {
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

      // Write JSON
      zip.file('MapConfig.json', JSON.stringify(mapConfig, null, 2));

      // Embed Editor Script
      const csharpScript = `using UnityEngine;
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

    private Tilemap groundTilemap;
    private Tilemap oceanTilemap;
    private Tilemap foamTilemap;
    private Tilemap buildableGridTilemap;
    private Tilemap prefabHolderTilemap;

    [MenuItem("Tools/Farm Adventure/Apply Map Config Edits")]
    public static void ShowWindow()
    {
        GetWindow<ApplyMapConfigEditor>("Apply Map Config");
    }

    private void OnGUI()
    {
        GUILayout.Label("Apply Asset Footprints & Buildable Zone", EditorStyles.boldLabel);
        EditorGUI.BeginChangeCheck();
        mapConfigFile = (TextAsset)EditorGUILayout.ObjectField("MapConfig JSON", mapConfigFile, typeof(TextAsset), false);
        if (EditorGUI.EndChangeCheck() && mapConfigFile != null)
        {
            LoadConfig();
        }

        GUILayout.Space(10);
        
        if (missingPrefabs.Count > 0)
        {
            GUILayout.Label("Missing Prefabs Detected (Map to Blueprints)", EditorStyles.boldLabel);
            
            EditorGUILayout.BeginHorizontal();
            defaultBlueprint = (GameObject)EditorGUILayout.ObjectField("Default Blueprint", defaultBlueprint, typeof(GameObject), false);
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
                    if (prefabGuids.Length == 0)
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

        buildableGridTilemap = GetOrCreateTilemap(gridObj, "BuildableGrid", 2);
        prefabHolderTilemap = GetOrCreateTilemap(gridObj, "PrefabHolder", 0, "Foreground");
    }

    private void ApplyEdits(string json)
    {
        WebMapConfig config = JsonUtility.FromJson<WebMapConfig>(json);
        if (config == null) return;

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
            
            TileBase buildableTileBase = null;
            string[] tileGuids = AssetDatabase.FindAssets("Buildable t:Tile");
            if (tileGuids.Length > 0) buildableTileBase = AssetDatabase.LoadAssetAtPath<TileBase>(AssetDatabase.GUIDToAssetPath(tileGuids[0]));
            else {
                string[] spriteGuids = AssetDatabase.FindAssets("Buildable t:Sprite");
                if (spriteGuids.Length > 0) {
                    Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(AssetDatabase.GUIDToAssetPath(spriteGuids[0]));
                    if (s != null) {
                        Tile newTile = ScriptableObject.CreateInstance<Tile>();
                        newTile.sprite = s;
                        if (!AssetDatabase.IsValidFolder("Assets/Tiles")) AssetDatabase.CreateFolder("Assets", "Tiles");
                        AssetDatabase.CreateAsset(newTile, "Assets/Tiles/Buildable.asset");
                        buildableTileBase = newTile;
                    }
                }
            }

            if (buildableTileBase != null) {
                int height = config.buildableGrid.Count;
                for (int y = 0; y < height; y++)
                {
                    int width = config.buildableGrid[y].columns.Count;
                    for (int x = 0; x < width; x++)
                    {
                        if (config.buildableGrid[y].columns[x] == 1)
                        {
                            Vector3Int pos = new Vector3Int(x, y, 0);
                            buildableGridTilemap.SetTile(pos, buildableTileBase);
                        }
                    }
                }
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
                    if (prefabGuids.Length > 0)
                    {
                        string path = AssetDatabase.GUIDToAssetPath(prefabGuids[0]);
                        prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    }
                    else if (blueprintMappings.ContainsKey(item.id) && blueprintMappings[item.id] != null)
                    {
                        GameObject blueprintTemplate = blueprintMappings[item.id];
                        
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
                                GameObject cloned = (GameObject)PrefabUtility.InstantiatePrefab(blueprintTemplate);
                                
                                SpriteRenderer sr = cloned.GetComponentInChildren<SpriteRenderer>();
                                if (sr == null) sr = cloned.AddComponent<SpriteRenderer>();
                                sr.sprite = s;
                                
                                if (!AssetDatabase.IsValidFolder("Assets/Prefabs"))
                                {
                                    AssetDatabase.CreateFolder("Assets", "Prefabs");
                                }
                                
                                WebAssetDef def = config.assetDefinitions.Find(d => d.id == item.id);
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

                                prefab = PrefabUtility.SaveAsPrefabAsset(cloned, "Assets/Prefabs/" + item.id + ".prefab");
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
                    string tilePath = "Assets/Tiles/PrefabTiles";
                    if (!AssetDatabase.IsValidFolder("Assets/Tiles"))
                    {
                        AssetDatabase.CreateFolder("Assets", "Tiles");
                    }
                    if (!AssetDatabase.IsValidFolder(tilePath))
                    {
                        AssetDatabase.CreateFolder("Assets/Tiles", "PrefabTiles");
                    }

                    string assetPath = tilePath + "/" + prefab.name + "_Tile.asset";
                    Tile prefabTile = AssetDatabase.LoadAssetAtPath<Tile>(assetPath);
                    if (prefabTile == null)
                    {
                        prefabTile = ScriptableObject.CreateInstance<Tile>();
                        prefabTile.gameObject = prefab;
                        AssetDatabase.CreateAsset(prefabTile, assetPath);
                    }
                    else if (prefabTile.gameObject != prefab)
                    {
                        prefabTile.gameObject = prefab;
                        EditorUtility.SetDirty(prefabTile);
                        AssetDatabase.SaveAssets();
                    }

                    Vector3Int pos = new Vector3Int(item.position.x, item.position.y, 0);
                    prefabHolderTilemap.SetTile(pos, prefabTile);
                }
            }
        }

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
                            
                            settings.spriteAlignment = refSettings.spriteAlignment;
                            settings.spritePivot = refSettings.spritePivot;
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
                            
                            if (settings.spriteAlignment != refSettings.spriteAlignment || settings.spritePivot != refSettings.spritePivot)
                            {
                                settings.spriteAlignment = refSettings.spriteAlignment;
                                settings.spritePivot = refSettings.spritePivot;
                                importer.SetTextureSettings(settings);
                                changed = true;
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
