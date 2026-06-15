import re

file_path = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\map-generator\ParameterUI.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_csharp_script = """const csharpScript = `
using UnityEngine;
using UnityEditor;
using System.IO;
using System.Collections.Generic;
using UnityEngine.Tilemaps;
using System.Linq;

[System.Serializable]
public class WebMapRow {
    public List<int> columns;
}

[System.Serializable]
public class WebMapConfig
{
    public string islandName;
    public List<WebMapItem> ocean;
    public List<WebMapItem> ground;
    public List<WebMapItem> objects;
    public List<WebMapRow> buildableGrid;
}

[System.Serializable]
public class WebMapItem
{
    public string id;
    public Vector2 position;
    public int layer;
    public string type;
}

public class MapImporterWindow : EditorWindow
{
    public TextAsset mapConfigFile;
    private WebMapConfig config;
    private List<string> uniqueWebObjects = new List<string>();
    
    private string[] selectedCategories;
    private string[] targetPrefabIds;
    private string[] categoryOptions = new string[] { "Mineral", "Tree", "Building", "Decoration", "Cloud" };

    private Vector2 scrollPos;

    [MenuItem("Tools/Map Generator/Map Importer")]
    public static void ShowWindow()
    {
        GetWindow<MapImporterWindow>("Standardized Map Importer");
    }

    private void OnGUI()
    {
        GUILayout.Label("Standardized Map Importer", EditorStyles.boldLabel);
        mapConfigFile = (TextAsset)EditorGUILayout.ObjectField("MapConfig JSON", mapConfigFile, typeof(TextAsset), false);

        if (GUILayout.Button("Load Config"))
        {
            LoadConfig();
        }

        if (config != null && uniqueWebObjects.Count > 0)
        {
            EditorGUILayout.Space();
            GUILayout.Label("Map Object Prefabs:", EditorStyles.boldLabel);
            
            scrollPos = EditorGUILayout.BeginScrollView(scrollPos);
            for (int i = 0; i < uniqueWebObjects.Count; i++)
            {
                EditorGUILayout.BeginHorizontal();
                GUILayout.Label(uniqueWebObjects[i], GUILayout.Width(150));
                
                int catIndex = System.Array.IndexOf(categoryOptions, selectedCategories[i]);
                if (catIndex == -1) catIndex = 0;
                
                catIndex = EditorGUILayout.Popup(catIndex, categoryOptions, GUILayout.Width(100));
                selectedCategories[i] = categoryOptions[catIndex];
                
                targetPrefabIds[i] = EditorGUILayout.TextField(targetPrefabIds[i], GUILayout.Width(100));
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndScrollView();

            EditorGUILayout.Space();
            if (GUILayout.Button("Import, Generate & Paint"))
            {
                ExecuteImport();
            }
        }
    }

    private void LoadConfig()
    {
        if (mapConfigFile == null) return;
        config = JsonUtility.FromJson<WebMapConfig>(mapConfigFile.text);
        if (config == null || config.objects == null) return;

        uniqueWebObjects = config.objects.Select(o => o.id).Distinct().ToList();
        selectedCategories = new string[uniqueWebObjects.Count];
        targetPrefabIds = new string[uniqueWebObjects.Count];
        
        for (int i = 0; i < uniqueWebObjects.Count; i++)
        {
            selectedCategories[i] = "Mineral"; // Default
            targetPrefabIds[i] = "r_100"; // Default
        }
    }

    private void ExecuteImport()
    {
        string folderPath = AssetDatabase.GetAssetPath(mapConfigFile);
        if (string.IsNullOrEmpty(folderPath)) {
            Debug.LogError("Please select the MapConfig file from your Project window, not a scene instance.");
            return;
        }
        folderPath = Path.GetDirectoryName(folderPath).Replace("\\\\", "/");
        EnforcePPU(folderPath);

        // Environment Generation (Ground, Ocean, Buildable)
        GameObject root = GameObject.Find(config.islandName);
        if (root == null) root = new GameObject(config.islandName);
        
        System.Type mapManagerType = System.Type.GetType("MapManager, Assembly-CSharp");
        if (mapManagerType != null && root.GetComponent(mapManagerType) == null)
            root.AddComponent(mapManagerType);

        GameObject gridx3Obj = root.transform.Find("Gridx3")?.gameObject;
        if (gridx3Obj == null) { gridx3Obj = new GameObject("Gridx3"); gridx3Obj.transform.SetParent(root.transform); }
        Grid gridx3 = gridx3Obj.GetComponent<Grid>();
        if (gridx3 == null) gridx3 = gridx3Obj.AddComponent<Grid>();
        gridx3.cellLayout = GridLayout.CellLayout.Isometric;
        gridx3.cellSize = new Vector3(3f, 1.5f, 1f);

        GameObject gridObj = root.transform.Find("Grid")?.gameObject;
        if (gridObj == null) { gridObj = new GameObject("Grid"); gridObj.transform.SetParent(root.transform); }
        Grid gridMicro = gridObj.GetComponent<Grid>();
        if (gridMicro == null) gridMicro = gridObj.AddComponent<Grid>();
        gridMicro.cellLayout = GridLayout.CellLayout.IsometricZAsY;
        gridMicro.cellSize = new Vector3(1f, 0.5f, 1f);

        Tilemap foamTilemap = CreateTilemap(gridx3Obj, "Foam", 0);
        Tilemap oceanTilemap = CreateTilemap(gridx3Obj, "Ocean", -1);
        Tilemap groundTilemap = CreateTilemap(gridx3Obj, "Ground", 1);
        Tilemap buildableTilemap = CreateTilemap(gridObj, "BuildableGrid", 2);
        Tilemap prefabHolder = CreateTilemap(gridObj, "PrefabHolder", 3);

        foamTilemap.transform.localPosition = new Vector3(0f, -1.5f, 0f);
        oceanTilemap.transform.localPosition = new Vector3(0f, -1.5f, 0f);
        groundTilemap.transform.localPosition = new Vector3(0f, -1.5f, 0f);
        buildableTilemap.transform.localPosition = new Vector3(0f, 0.5f, 0f);
        prefabHolder.transform.localPosition = new Vector3(0f, 0f, 0f); // PrefabHolder inherits exactly from Grid!

        foamTilemap.ClearAllTiles();
        oceanTilemap.ClearAllTiles();
        groundTilemap.ClearAllTiles();
        buildableTilemap.ClearAllTiles();
        prefabHolder.ClearAllTiles();

        // Build BuildableGrid
        if (config.buildableGrid != null && config.buildableGrid.Count > 0)
        {
            Tile buildableTile = null;
            string[] tileGuids = AssetDatabase.FindAssets("Tile_Buildable t:Tile", new string[] { "Assets" });
            if (tileGuids.Length > 0) buildableTile = AssetDatabase.LoadAssetAtPath<Tile>(AssetDatabase.GUIDToAssetPath(tileGuids[0]));
            
            string[] spriteGuids = AssetDatabase.FindAssets("Tile_Buildable t:Sprite", new string[] { folderPath });
            if (spriteGuids.Length == 0) spriteGuids = AssetDatabase.FindAssets("Tile_Buildable t:Sprite");
            
            if (spriteGuids.Length > 0) {
                Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(AssetDatabase.GUIDToAssetPath(spriteGuids[0]));
                if (s != null) {
                    if (buildableTile == null) {
                        buildableTile = ScriptableObject.CreateInstance<Tile>();
                        if (!AssetDatabase.IsValidFolder("Assets/Tiles")) AssetDatabase.CreateFolder("Assets", "Tiles");
                        AssetDatabase.CreateAsset(buildableTile, "Assets/Tiles/Tile_Buildable.asset");
                    }
                    if (buildableTile.sprite != s) {
                        buildableTile.sprite = s;
                        EditorUtility.SetDirty(buildableTile);
                        AssetDatabase.SaveAssets();
                    }
                }
            }

            if (buildableTile != null) {
                for (int y = 0; y < config.buildableGrid.Count; y++) {
                    for (int x = 0; x < config.buildableGrid[y].columns.Count; x++) {
                        if (config.buildableGrid[y].columns[x] == 1) {
                            buildableTilemap.SetTile(new Vector3Int(x, y, 0), buildableTile);
                        }
                    }
                }
            }
        }

        // Paint Environment Tiles
        Dictionary<string, Tile> tileCache = new Dictionary<string, Tile>();
        List<WebMapItem> allEnvTiles = new List<WebMapItem>();
        if (config.ocean != null) allEnvTiles.AddRange(config.ocean);
        if (config.ground != null) allEnvTiles.AddRange(config.ground);

        foreach (var item in allEnvTiles)
        {
            if (!tileCache.ContainsKey(item.id))
            {
                string[] guids = AssetDatabase.FindAssets(item.id + " t:Sprite", new string[] { folderPath });
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
                Vector3Int pos = new Vector3Int((int)item.position.x, (int)item.position.y, 0);
                if (item.id.StartsWith("Foam_")) foamTilemap.SetTile(pos, tile);
                else if (item.id.StartsWith("Ocean_")) oceanTilemap.SetTile(pos, tile);
                else groundTilemap.SetTile(pos, tile);
            }
        }

        // Standardized Object Prefab Generation
        string baseOutputFolder = folderPath + "/Prefabs";
        string tileOutputFolder = folderPath + "/Tiles";
        if (!Directory.Exists(baseOutputFolder)) Directory.CreateDirectory(baseOutputFolder);
        if (!Directory.Exists(tileOutputFolder)) Directory.CreateDirectory(tileOutputFolder);
        AssetDatabase.Refresh();

        Dictionary<string, Tile> generatedTiles = new Dictionary<string, Tile>();

        for (int i = 0; i < uniqueWebObjects.Count; i++)
        {
            string webObjId = uniqueWebObjects[i];
            string category = selectedCategories[i];
            string gameId = targetPrefabIds[i];

            string blueprintPath = folderPath + $"/Blueprints/Blueprint_{category}.prefab";
            if (!File.Exists(blueprintPath))
            {
                Debug.LogError($"Blueprint not found at {blueprintPath}. Skipping {webObjId}.");
                continue;
            }

            string newPrefabPath = $"{baseOutputFolder}/{webObjId}.prefab";
            if (!File.Exists(newPrefabPath)) {
                AssetDatabase.CopyAsset(blueprintPath, newPrefabPath);
            }
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            GameObject newPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(newPrefabPath);
            if (newPrefab != null)
            {
                // Find sprite
                string[] spriteGuids = AssetDatabase.FindAssets(webObjId + " t:Sprite", new string[] { folderPath });
                if (spriteGuids.Length > 0)
                {
                    string spritePath = AssetDatabase.GUIDToAssetPath(spriteGuids[0]);
                    Sprite sprite = AssetDatabase.LoadAssetAtPath<Sprite>(spritePath);
                    
                    SpriteRenderer[] srs = newPrefab.GetComponentsInChildren<SpriteRenderer>(true);
                    foreach (var sr in srs)
                    {
                        if (sr.gameObject.name.ToLower().Contains("sprite") || sr.gameObject.name.ToLower().Contains("avatar"))
                        {
                            sr.sprite = sprite;
                            break;
                        }
                    }
                }

                // Inject ID using reflection
                MonoBehaviour[] scripts = newPrefab.GetComponents<MonoBehaviour>();
                foreach (var s in scripts)
                {
                    if (s == null) continue;
                    var field = s.GetType().GetField("id", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
                    if (field != null && field.FieldType == typeof(string))
                    {
                        field.SetValue(s, gameId);
                    }
                }

                EditorUtility.SetDirty(newPrefab);
                PrefabUtility.SavePrefabAsset(newPrefab);

                // Create Tile
                Tile newTile = ScriptableObject.CreateInstance<Tile>();
                newTile.gameObject = newPrefab;
                AssetDatabase.CreateAsset(newTile, $"{tileOutputFolder}/{webObjId}_Tile.asset");
                generatedTiles[webObjId] = newTile;
            }
        }
        AssetDatabase.SaveAssets();

        // Place on PrefabHolder Tilemap
        foreach (var obj in config.objects)
        {
            if (generatedTiles.TryGetValue(obj.id, out Tile tile))
            {
                Vector3Int pos = new Vector3Int((int)obj.position.x, (int)obj.position.y, 0);
                prefabHolder.SetTile(pos, tile);
            }
        }
        
        Debug.Log("Import and Placement Complete!");
    }

    private Tilemap CreateTilemap(GameObject parent, string name, int order)
    {
        Transform child = parent.transform.Find(name);
        GameObject obj = child != null ? child.gameObject : new GameObject(name);
        obj.transform.SetParent(parent.transform);
        Tilemap tm = obj.GetComponent<Tilemap>();
        if (tm == null) tm = obj.AddComponent<Tilemap>();
        TilemapRenderer tr = obj.GetComponent<TilemapRenderer>();
        if (tr == null) tr = obj.AddComponent<TilemapRenderer>();
        tr.mode = TilemapRenderer.Mode.Individual;
        tr.sortingOrder = order;
        return tm;
    }

    private void EnforcePPU(string folderPath)
    {
        if (!AssetDatabase.IsValidFolder(folderPath)) return;
        string[] guids = AssetDatabase.FindAssets("t:Texture2D", new string[] { folderPath });
        foreach (string guid in guids)
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer != null && (importer.spritePixelsPerUnit != (280f / 3f) || importer.textureType != TextureImporterType.Sprite))
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spritePixelsPerUnit = 280f / 3f;
                importer.spritePivot = new Vector2(0.5f, 0f);
                importer.spriteImportMode = SpriteImportMode.Single;
                
                TextureImporterSettings settings = new TextureImporterSettings();
                importer.ReadTextureSettings(settings);
                settings.spriteAlignment = (int)SpriteAlignment.BottomCenter;
                importer.SetTextureSettings(settings);

                importer.SaveAndReimport();
            }
        }
    }
}
`;"""

start_str = "const csharpScript = `"
end_str = "zip.file('Editor/ApplyMapConfigEditor.cs', csharpScript);"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    code_block = content[start_idx:end_idx]
    last_backtick_idx = code_block.rfind("`;")
    
    if last_backtick_idx != -1:
        content = content[:start_idx] + new_csharp_script + content[start_idx + last_backtick_idx + 2:]
        print("Spliced correctly!")
    else:
        print("Could not find backtick")
else:
    print("Could not find start or end strings")

zip_fetch_code = """
        const blueprints = [
          'Blueprint_Mineral.prefab',
          'Blueprint_Decoration.prefab',
          'Blueprint_Cloud.prefab',
          'Blueprint_Tree.prefab',
          'Blueprint_Building.prefab'
        ];
        for (const bp of blueprints) {
          try {
            const res = await fetch(`/assets/blueprints/${bp}`);
            const blob = await res.blob();
            zip.file(`Blueprints/${bp}`, blob);
          } catch (e) {
            console.error(`Failed to fetch blueprint ${bp}`, e);
          }
        }
        
        const content = await zip.generateAsync"""

content = content.replace('const content = await zip.generateAsync', zip_fetch_code)
content = content.replace("zip.file('Editor/ApplyMapConfigEditor.cs', csharpScript);", "zip.file('Editor/MapImporterWindow.cs', csharpScript);")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
