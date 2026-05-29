export interface PlacedObject {
  url: string;
  id: string;
  instanceId: string;
  cellX: number;
  cellY: number;
  layer?: number;
  lx: number;
  ly: number;
  baseTiles?: { lx: number, ly: number }[];
}

export interface MapGridCell {
  x: number;
  y: number;
  layer?: number;
  isLand: boolean;
  isTopFace?: boolean;
  tileId?: string;
  objects: PlacedObject[];
  distance?: number;
  rawDistance?: number;
  taperTile?: string;
  foamTile?: string;
}

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

export class TerrainGenerator {
  static generate(canvasWidth: number, canvasHeight: number, islandWidth: number, islandHeight: number, seed: number, noiseScale: number, objectAssets: any[] = [], groundOverrides: Record<string, number> = {}, levels: number[] = [1]): Record<number, MapGridCell[][]> {
    const cw = Number(canvasWidth);
    const ch = Number(canvasHeight);
    const iw = Number(islandWidth);
    const ih = Number(islandHeight);
    const rng = new SeededRandom(seed);
    const results: Record<number, MapGridCell[][]> = {};

    const startX = Math.floor((cw - iw) / 2);
    const startY = Math.floor((ch - ih) / 2);

    for (const level of levels) {
      // Create empty canvas grid
      const grid: boolean[][] = [];
      for (let y = 0; y < ch; y++) {
        grid[y] = new Array(cw).fill(false);
      }

      if (level === 1) {
        // Generate island within iw x ih
        const islandGrid: boolean[][] = [];
        for (let y = 0; y < ih; y++) {
          const row: boolean[] = [];
          for (let x = 0; x < iw; x++) {
            const cx = iw / 2;
            const cy = ih / 2;
            const dx = (x - cx) / cx;
            const dy = (y - cy) / cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let landProb = 1.0 - (dist * 1.5);
            landProb += (rng.next() - 0.5) * noiseScale * 2;
            row.push(landProb > 0.3);
          }
          islandGrid.push(row);
        }

        // Cellular Automata on islandGrid
        for (let i = 0; i < 3; i++) {
          const newGrid = islandGrid.map(row => [...row]);
          for (let y = 0; y < ih; y++) {
            for (let x = 0; x < iw; x++) {
              let neighbors = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < iw && ny >= 0 && ny < ih) {
                    if (islandGrid[ny][nx]) neighbors++;
                  }
                }
              }
              if (islandGrid[y][x]) {
                newGrid[y][x] = neighbors >= 3;
              } else {
                newGrid[y][x] = neighbors >= 5;
              }
            }
          }
          for (let y = 0; y < ih; y++) {
            for (let x = 0; x < iw; x++) {
              islandGrid[y][x] = newGrid[y][x];
            }
          }
        }

        // Copy islandGrid into main grid at startX, startY
        for (let y = 0; y < ih; y++) {
          for (let x = 0; x < iw; x++) {
            if (startY + y >= 0 && startY + y < ch && startX + x >= 0 && startX + x < cw) {
              grid[startY + y][startX + x] = islandGrid[y][x];
            }
          }
        }
      }

      // Apply overrides
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const overrideKey = `${level},${x},${y}`;
          if (groundOverrides.hasOwnProperty(overrideKey)) {
            grid[y][x] = groundOverrides[overrideKey] === 1;
          }
        }
      }

      // Enforce constraints on the full grid
      let changed = true;
      let passes = 0;
      while (changed && passes < 10) {
        changed = false;
        passes++;

        // Removed: Largest connected component filter
        // Removed: Hole filling algorithm

        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            if (!grid[y][x]) continue;

            const N = y > 0 && grid[y - 1][x];
            const S = y < ch - 1 && grid[y + 1][x];
            const E = x < cw - 1 && grid[y][x + 1];
            const W = x > 0 && grid[y][x - 1];

            const cardinals = (N ? 1 : 0) + (S ? 1 : 0) + (E ? 1 : 0) + (W ? 1 : 0);

            // Rule: Prune peninsulas and isolated 1x1 islands
            // We explicitly delete tiles that have fewer than 2 connections.
            // - cardinals === 0: Deletes isolated 1x1 islands.
            // - cardinals === 1: Deletes 1x-thick peninsulas (end nodes of strips).
            // This ensures all landmasses are at least 2x2.
            if (cardinals < 2) {
              grid[y][x] = false;
              changed = true;
              continue;
            }

            // Rule: No 1xN bridges (exactly 2 opposite connections)
            if (cardinals === 2) {
              if (N && S) {
                // Vertical bridge: thicken East
                if (x < cw - 1) grid[y][x + 1] = true;
                changed = true;
              } else if (E && W) {
                // Horizontal bridge: thicken South
                if (y < ch - 1) grid[y + 1][x] = true;
                changed = true;
              }
            }

            // Rule: Prevent double inner corners
            if (cardinals === 4) {
              const NE = grid[y - 1][x + 1];
              const SE = grid[y + 1][x + 1];
              const SW = grid[y + 1][x - 1];
              const NW = grid[y - 1][x - 1];

              const waterDiags = (!NE ? 1 : 0) + (!SE ? 1 : 0) + (!SW ? 1 : 0) + (!NW ? 1 : 0);
              if (waterDiags > 1) {
                if (!NE) grid[y - 1][x + 1] = true;
                else if (!SE) grid[y + 1][x + 1] = true;
                else if (!SW) grid[y + 1][x - 1] = true;
                else if (!NW) grid[y - 1][x - 1] = true;
                changed = true;
              }
            }

            // Rule: Must form a valid auto-tile
            const tN = x < cw - 1 && grid[y][x + 1] ? 1 : 0;
            const tE = y > 0 && grid[y - 1][x] ? 1 : 0;
            const tS = x > 0 && grid[y][x - 1] ? 1 : 0;
            const tW = y < ch - 1 && grid[y + 1][x] ? 1 : 0;
            let tNE = 1, tSE = 1, tSW = 1, tNW = 1;
            if (tN && tE) tNE = grid[y - 1][x + 1] ? 1 : 0;
            if (tE && tS) tSE = grid[y - 1][x - 1] ? 1 : 0;
            if (tS && tW) tSW = grid[y + 1][x - 1] ? 1 : 0;
            if (tW && tN) tNW = grid[y + 1][x + 1] ? 1 : 0;
            const validTile = TerrainGenerator.getTileId(tN, tE, tS, tW, tNE, tSE, tSW, tNW);
            if (!validTile) {
              grid[y][x] = false;
              changed = true;
              continue;
            }
          }
        }
      }

      // Auto-Tiling
      const result: MapGridCell[][] = [];
      for (let y = 0; y < ch; y++) {
        const row: MapGridCell[] = [];
        for (let x = 0; x < cw; x++) {
          const isLand = grid[y][x];
          let tileId: string | undefined = undefined;

          if (isLand) {
            const N = x < cw - 1 && grid[y][x + 1] ? 1 : 0;
            const E = y > 0 && grid[y - 1][x] ? 1 : 0;
            const S = x > 0 && grid[y][x - 1] ? 1 : 0;
            const W = y < ch - 1 && grid[y + 1][x] ? 1 : 0;

            let NE = 1, SE = 1, SW = 1, NW = 1;
            if (N && E) NE = grid[y - 1][x + 1] ? 1 : 0;
            if (E && S) SE = grid[y - 1][x - 1] ? 1 : 0;
            if (S && W) SW = grid[y + 1][x - 1] ? 1 : 0;
            if (W && N) NW = grid[y + 1][x + 1] ? 1 : 0;

            tileId = this.getTileId(N, E, S, W, NE, SE, SW, NW) || undefined;
          }

          row.push({ x, y, layer: level, isLand, tileId, objects: [] });
        }
        result.push(row);
      }
      results[level] = result;
    }

    // 5. Object Scattering Pass
    if (objectAssets && objectAssets.length > 0 && results[1]) {
      const rngScatter = new SeededRandom(seed + 12345);
      const occupancy = new Set<string>();

      const isSlotValid = (gx: number, gy: number, filterCenterOnly: boolean) => {
        const cx = Math.floor(gx / 3);
        const cy = Math.floor(gy / 3);
        if (cy < 0 || cy >= ch || cx < 0 || cx >= cw) return false;
        const cell = results[1][cy][cx];
        if (!cell || !cell.isLand || !cell.tileId) return false;
        if (filterCenterOnly && cell.tileId !== 'CenterFill') return false;
        return !occupancy.has(`${gx},${gy}`);
      };

      for (const asset of objectAssets) {
        if (!asset.amount || asset.amount <= 0) continue;
        const rawBaseTiles = asset.baseTiles && asset.baseTiles.length > 0 ? asset.baseTiles : [{ lx: 0, ly: 0 }];
        const limit = Math.floor(1.5 * (asset.scale || 1.0));
        let baseTiles = rawBaseTiles.filter((t: { lx: number, ly: number }) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
        if (baseTiles.length === 0) baseTiles = [{ lx: 0, ly: 0 }];

        const assetStrVal = Array.from(asset.id).reduce((sum: number, char: any) => sum + char.charCodeAt(0), 0);
        const assetSeed = seed + 12345 + (asset.seedOffset || 0) * 1000 + assetStrVal;
        const assetRng = new SeededRandom(assetSeed);

        const availablePositions: { gx: number, gy: number }[] = [];

        for (let gy = 0; gy < ch * 3; gy++) {
          for (let gx = 0; gx < cw * 3; gx++) {
            let canPlace = true;
            for (const tile of baseTiles) {
              const tgx = gx + tile.lx;
              const tgy = gy + tile.ly;
              if (!isSlotValid(tgx, tgy, !asset.allowOnEdge)) {
                canPlace = false;
                break;
              }
            }
            if (canPlace) availablePositions.push({ gx, gy });
          }
        }

        let placed = 0;
        while (placed < asset.amount && availablePositions.length > 0) {
          const randIdx = Math.floor(assetRng.next() * availablePositions.length);
          const pos = availablePositions[randIdx];

          let stillValid = true;
          for (const tile of baseTiles) {
            if (occupancy.has(`${pos.gx + tile.lx},${pos.gy + tile.ly}`)) {
              stillValid = false;
              break;
            }
          }

          if (stillValid) {
            const cx = Math.floor(pos.gx / 3);
            const cy = Math.floor(pos.gy / 3);
            const lx = pos.gx - cx * 3 - 1;
            const ly = pos.gy - cy * 3 - 1;

            results[1][cy][cx].objects.push({
              url: asset.imageUrl,
              id: asset.id,
              instanceId: `${asset.id}-${placed}`,
              cellX: cx,
              cellY: cy,
              lx: lx,
              ly: ly,
              baseTiles: baseTiles
            });

            for (const tile of baseTiles) {
              occupancy.add(`${pos.gx + tile.lx},${pos.gy + tile.ly}`);
            }
            placed++;
          }

          availablePositions.splice(randIdx, 1);
        }
      }
    }

    return results;
  }

  public static getTileId(n: number, e: number, s: number, w: number, ne: number, se: number, sw: number, nw: number): string | null {
    const cCode = `${n}${e}${s}${w}`;

    if (cCode === '1111') {
      const dCode = `${ne}${se}${sw}${nw}`;
      if (dCode === '0111') return 'InnerCornerEast';
      if (dCode === '1011') return 'InnerCornerSouth';
      if (dCode === '1101') return 'InnerCornerWest';
      if (dCode === '1110') return 'InnerCornerNorth';
      if (dCode === '1111') return 'CenterFill';
      return null;
    }

    const map: Record<string, string> = {
      '0111': 'EdgeNorthEast',
      '1011': 'EdgeSouthEast',
      '1101': 'EdgeSouthWest',
      '1110': 'EdgeNorthWest',
      '0011': 'OutterCornerEast',
      '1001': 'OutterCornerSouth',
      '1100': 'OutterCornerWest',
      '0110': 'OutterCornerNorth',
      '0000': 'CenterFill',
    };

    return map[cCode] || null;
  }
}

