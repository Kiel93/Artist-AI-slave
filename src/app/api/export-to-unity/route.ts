import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// The path to your Unity project. You can change this if you move your project.
const UNITY_PROJECT_PATH = 'E:\\Project Unity\\tgs_p64_farm_adventure3';
const EXPORT_FOLDER = path.join(UNITY_PROJECT_PATH, 'Assets', 'WebMapExport');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mapConfig, assets, islandName = 'Island_1' } = body;
    
    // Create a unique export folder per island name
    const EXPORT_FOLDER = path.join(UNITY_PROJECT_PATH, 'Assets', 'WebMapExport', islandName);

    if (!mapConfig || !assets) {
      return NextResponse.json({ error: 'Missing mapConfig or assets' }, { status: 400 });
    }

    // Ensure the export folder exists
    await fs.mkdir(EXPORT_FOLDER, { recursive: true });

    // Update mapConfig to include the islandName so the Unity importer knows what to group it under
    mapConfig.islandName = islandName;

    // Save all assets (images)
    for (const asset of assets) {
      const { name, url } = asset;
      const fileName = name;
      
      // Force Editor scripts to the root WebMapExport directory to prevent duplicate compilation errors in Unity
      let filePath;
      if (fileName.startsWith('Editor/')) {
        filePath = path.join(UNITY_PROJECT_PATH, 'Assets', 'WebMapExport', fileName);
      } else {
        filePath = path.join(EXPORT_FOLDER, fileName);
      }
      
      // Ensure the specific file's directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      if (!url) {
        console.error("Asset missing URL:", name);
        continue;
      }

      if (url.startsWith('data:')) {
        // Base64 image
        const base64Data = url.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          await fs.writeFile(filePath, buffer);
        }
      } else if (url.startsWith('/')) {
        // Local public asset
        try {
          const publicPath = path.join(process.cwd(), 'public', url);
          const buffer = await fs.readFile(publicPath);
          await fs.writeFile(filePath, buffer);
        } catch (e) {
          console.error("Failed to read local asset:", name, e);
        }
      } else {
        // Normal URL - fetch and save
        try {
          const res = await fetch(url);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          await fs.writeFile(filePath, buffer);
        } catch (e) {
          console.error("Failed to fetch and save asset:", name, e);
        }
      }
    }

    // Save MapConfig.json AT THE VERY END to prevent Unity AssetPostprocessor race condition!
    const configPath = path.join(EXPORT_FOLDER, 'MapConfig.json');
    await fs.writeFile(configPath, JSON.stringify(mapConfig, null, 2));

    return NextResponse.json({ success: true, message: `Successfully exported to ${EXPORT_FOLDER}` });
  } catch (error: any) {
    const errorLog = `[${new Date().toISOString()}] Export to Unity failed:\n${error.stack || error.message || error}\n\n`;
    await fs.appendFile(path.join(process.cwd(), 'debug.log'), errorLog).catch(() => {});
    console.error("Export to Unity failed:", error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}
