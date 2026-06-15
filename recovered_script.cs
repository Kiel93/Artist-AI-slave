using UnityEngine;
using UnityEditor;
using System.IO;
using System.Collections.Generic;
using UnityEngine.Tilemaps;

public class ApplyMapConfigEditor : EditorWindow
{
    public TextAsset mapConfigFile;
    public Tilemap groundTilemap;
    public Tilemap oceanTilemap;
    public Tilemap foamTilemap;
    public Tilemap buildableGridTilemap;
    public Transform objectsRoot;

    [MenuItem("Tools/Farm Adventure/Apply Map Config Edits")]
    public static void ShowWindow()
    {
        GetWindow<ApplyMapConfigEditor>("Apply Map Config");
    }

    private void OnGUI()
    {
        GUILayout.Label("Apply Asset Footprints & Buildable Zone", EditorStyles.boldLabel);
        mapConfigFile = (TextAsset)EditorGUILayout.ObjectField("MapConfig JSON", mapConfigFile, typeof(TextAsset), false);
        GUILayout.Space(10);
        GUILayout.Label("Map Generation (Optional)", EditorStyles.boldLabel);
        groundTilemap = (Tilemap)EditorGUILayout.ObjectField("Ground Tilemap", groundTilemap, typeof(Tilemap), true);
        oceanTilemap = (Tilemap)EditorGUILayout.ObjectField("Ocean Tilemap", oceanTilemap, typeof(Tilemap), true);
        foamTilemap = (Tilemap)EditorGUILayout.ObjectField("Foam Tilemap", foamTilemap, typeof(Tilemap), true);
        buildableGridTilemap = (Tilemap)EditorGUILayout.ObjectField("Buildable Grid", buildableGridTilemap, typeof(Tilemap), true);
        objectsRoot = (Transform)EditorGUILayout.ObjectField("Objects Root", objectsRoot, typeof(Transform), true);
        GUILayout.Space(10);

        if (GUILayout.Button("Apply Edits & Generate Map"))
        {
            if (mapConfigFile != null)
            {
                AutoAssignTilemaps();
                ApplyEdits(mapConfigFile.text);
            }
            else
            {
                Debug.LogError("Please assign a MapConfig JSON file first!");
            }
        }
    }

    private void AutoAssignTilemaps()
    {
        if (groundTilemap == null) groundTilemap = GameObject.Find("Ground")?.GetComponent<Tilemap>();
        if (oceanTilemap == null) oceanTilemap = GameObject.Find("Ocean")?.GetComponent<Tilemap>();
        if (foamTilemap == null) foamTilemap = GameObject.Find("Foam")?.GetComponent<Tilemap>();
        if (buildableGridTilemap == null) buildableGridTilemap = GameObject.Find("BuildableGrid")?.GetComponent<Tilemap>();
        if (objectsRoot == null) objectsRoot = GameObject.Find("Objects")?.transform;
        
        if (groundTilemap == null || oceanTilemap == null) 
        {
            Debug.LogWarning("Some Tilemaps were missing and could not be found by name ('Ground', 'Ocean', 'Foam'). You may need to assign them manually or ensure your scene has a Grid with these Tilemaps.");
        }
    }

    private void ApplyEdits(string json)
    {
        WebMapConfig config = JsonUtility.FromJson<WebMapConfig>(json);
        if (config == null) return;

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
                            go.area.size = new Vector2Int(maxX - minX + 1, maxY - minY + 1);
                        }
                        
                        EditorUtility.SetDirty(prefab);
                        PrefabUtility.SavePrefabAsset(prefab);
                    }
                }
            }
        }

        // 2. Build Buildable Zone
        if (config.buildableGrid != null && config.buildableGrid.Count > 0)
        {
            GridBuildSystem gbs = FindObjectOfType<GridBuildSystem>();
            if ((gbs != null && gbs.buildableTileMap != null) || buildableGridTilemap != null)
            {
                if (gbs != null && gbs.buildableTileMap != null) gbs.buildableTileMap.ClearAllTiles();
                if (buildableGridTilemap != null) buildableGridTilemap.ClearAllTiles();
                
                int height = config.buildableGrid.Count;
                for (int y = 0; y < height; y++)
                {
                    int width = config.buildableGrid[y].columns.Count;
                    for (int x = 0; x < width; x++)
                    {
                        if (config.buildableGrid[y].columns[x] == 1)
                        {
                            Vector3Int pos = new Vector3Int(-y, -x, 0);
                            TileBase tileBase = gbs != null ? gbs.buildableTileBase : null;
                            if (tileBase == null) {
                                string[] tileGuids = AssetDatabase.FindAssets("Buildable t:Tile");
                                if (tileGuids.Length > 0) tileBase = AssetDatabase.LoadAssetAtPath<TileBase>(AssetDatabase.GUIDToAssetPath(tileGuids[0]));
                                else {
                                    // Try to generate tile from sprite
                                    string[] spriteGuids = AssetDatabase.FindAssets("Buildable t:Sprite");
                                    if (spriteGuids.Length > 0) {
                                        Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(AssetDatabase.GUIDToAssetPath(spriteGuids[0]));
                                        if (s != null) {
                                            Tile newTile = ScriptableObject.CreateInstance<Tile>();
                                            newTile.sprite = s;
                                            if (!AssetDatabase.IsValidFolder("Assets/Tiles")) AssetDatabase.CreateFolder("Assets", "Tiles");
                                            AssetDatabase.CreateAsset(newTile, "Assets/Tiles/Buildable.asset");
                                            tileBase = newTile;
                                        }
                                    }
                                }
                            }
                            if (buildableGridTilemap != null && tileBase != null) {
                                buildableGridTilemap.SetTile(pos, tileBase);
                            } else if (gbs != null && gbs.buildableTileMap != null && tileBase != null) {
                                gbs.buildableTileMap.SetTile(pos, tileBase);
                            }
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
            if (!tileCache.ContainsKey(item.id))
            {
                string[] guids = AssetDatabase.FindAssets(item.id + " t:Sprite");
                Tile foundTile = null;
                foreach (string guid in guids)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                    if (s != null && s.name == item.id)
                    {
                        foundTile = ScriptableObject.CreateInstance<Tile>();
                        foundTile.sprite = s;
                        break;
                    }
                }
                tileCache[item.id] = foundTile;
            }

            if (tileCache.TryGetValue(item.id, out Tile tile) && tile != null)
            {
                if (item.id.StartsWith("Foam_") && foamTilemap != null) {
                    foamTilemap.SetTile(new Vector3Int(item.position.x, item.position.y, 0), tile);
                } else if (item.id.StartsWith("Ocean_") && oceanTilemap != null) {
                    oceanTilemap.SetTile(new Vector3Int(item.position.x, item.position.y, 0), tile);
                } else if (groundTilemap != null) {
                    groundTilemap.SetTile(new Vector3Int(item.position.x, item.position.y, 0), tile);
                }
            }
        }

        // 4. Build Objects
        if (objectsRoot != null)
        {
            for (int i = objectsRoot.childCount - 1; i >= 0; i--)
            {
                DestroyImmediate(objectsRoot.GetChild(i).gameObject);
            }

            GridLayout gridLayout = groundTilemap != null ? groundTilemap.layoutGrid : FindObjectOfType<GridLayout>();

            if (gridLayout != null)
            {
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
                        else
                        {
                            // Generate Prefab automatically from Sprite
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
                                GameObject tempGo = new GameObject(item.id);
                                SpriteRenderer sr = tempGo.AddComponent<SpriteRenderer>();
                                sr.sprite = s;
                                // Basic SortingGroup to ensure proper Isometric rendering
                                tempGo.AddComponent<UnityEngine.Rendering.SortingGroup>();

                                if (!AssetDatabase.IsValidFolder("Assets/Prefabs"))
                                {
                                    AssetDatabase.CreateFolder("Assets", "Prefabs");
                                }
                                prefab = PrefabUtility.SaveAsPrefabAsset(tempGo, "Assets/Prefabs/" + item.id + ".prefab");
                                DestroyImmediate(tempGo);
                            }
                        }
                        
                        if (prefab != null)
                        {
                            prefabCache[item.id] = prefab;
                        }
                    }
                }

                    if (prefab != null)
                    {
                        GameObject go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, objectsRoot);
                        Vector3 pos = gridLayout.CellToWorld(new Vector3Int((int)item.position.x, (int)item.position.y, 0));
                        go.transform.position = pos;
                        
                        SpriteRenderer sr = go.GetComponent<SpriteRenderer>();
                        if (sr != null)
                        {
                            sr.sortingOrder = item.layer;
                        }
                    }
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

        if (refImporter == null) {
            Debug.LogWarning("No existing Ground sprite found to copy import settings from. Using default Sprite settings (100 PPU).");
        }

        // 2. Apply settings to all generated sprites
        bool refreshNeeded = false;
        foreach (var item in allTiles)
        {
            if (item.id.StartsWith("Ocean_") || item.id.StartsWith("Foam_") || item.id.StartsWith("Ground_variation_"))
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
                            texImporter.spritePixelsPerUnit = refImporter.spritePixelsPerUnit;
                            
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
                            if (importer.spritePixelsPerUnit != refImporter.spritePixelsPerUnit) { 
                                importer.spritePixelsPerUnit = refImporter.spritePixelsPerUnit; 
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
