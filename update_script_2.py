import re

file_path = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\map-generator\ParameterUI.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_csharp_script = """const csharpScript = `
using UnityEngine;
using UnityEditor;
using System.IO;
using System.Collections.Generic;
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

public class BlueprintPrefabGenerator : EditorWindow
{
    public TextAsset mapConfigFile;
    private WebMapConfig config;
    private List<string> uniqueWebObjects = new List<string>();
    
    private string[] selectedCategories;
    private string[] targetPrefabIds;
    private string[] categoryOptions = new string[] { "Mineral", "Tree", "Building", "Decoration", "Cloud" };

    private Vector2 scrollPos;

    [MenuItem("Tools/Farm Adventure/1. Generate Blueprint Prefabs")]
    public static void ShowWindow()
    {
        GetWindow<BlueprintPrefabGenerator>("Blueprint Generator");
    }

    private void OnGUI()
    {
        GUILayout.Label("Step 1: Generate Standardized Blueprint Prefabs", EditorStyles.boldLabel);
        GUILayout.Label("Run this BEFORE 'Apply Map Config Edits'!", EditorStyles.helpBox);
        
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
            if (GUILayout.Button("Generate Prefabs from Blueprints"))
            {
                ExecuteGeneration();
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

    private void ExecuteGeneration()
    {
        string folderPath = AssetDatabase.GetAssetPath(mapConfigFile);
        if (string.IsNullOrEmpty(folderPath)) {
            Debug.LogError("Please select the MapConfig file from your Project window, not a scene instance.");
            return;
        }
        folderPath = Path.GetDirectoryName(folderPath).Replace("\\\\", "/");
        EnforcePPU(folderPath);

        // Standardized Object Prefab Generation
        string baseOutputFolder = folderPath + "/Prefabs";
        if (!Directory.Exists(baseOutputFolder)) Directory.CreateDirectory(baseOutputFolder);
        AssetDatabase.Refresh();

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
            }
        }
        AssetDatabase.SaveAssets();
        
        Debug.Log("Blueprint Generation Complete! You can now run the 'Apply Map Config Edits' window.");
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
end_str = "zip.file('Editor/MapImporterWindow.cs', csharpScript);"

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

content = content.replace("zip.file('Editor/MapImporterWindow.cs', csharpScript);", "zip.file('Editor/BlueprintPrefabGenerator.cs', csharpScript);")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
