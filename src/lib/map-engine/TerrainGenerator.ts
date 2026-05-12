export interface PlacedObject {
  url: string;
  id: string;
  instanceId: string;
  cellX: number;
  cellY: number;
  lx: number;
  ly: number;
  baseTiles?: {lx: number, ly: number}[];
}

export interface MapGridCell {
  x: number;
  y: number;
  isLand: boolean;
  tileId: string | null;
  objects: PlacedObject[];
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
  static generate(rawWidth: number, rawHeight: number, seed: number, noiseScale: number, objectAssets: any[] = []): MapGridCell[][] {
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    const rng = new SeededRandom(seed);
    const grid: boolean[][] = [];
    
    // 1. Initialize random grid
    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        const cx = width / 2;
        const cy = height / 2;
        const dx = (x - cx) / cx;
        const dy = (y - cy) / cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        let landProb = 1.0 - (dist * 1.5);
        landProb += (rng.next() - 0.5) * noiseScale * 2;
        row.push(landProb > 0.3);
      }
      grid.push(row);
    }

    // 2. Cellular Automata smoothing
    for (let i = 0; i < 3; i++) {
      const newGrid = grid.map(row => [...row]);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (grid[ny][nx]) neighbors++;
              }
            }
          }
          if (grid[y][x]) {
            newGrid[y][x] = neighbors >= 3;
          } else {
            newGrid[y][x] = neighbors >= 5;
          }
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          grid[y][x] = newGrid[y][x];
        }
      }
    }

    // 3. Enforce constraints (No 1x1 peninsulas, no bridges, no double inner corners)
    let changed = true;
    let passes = 0;
    while (changed && passes < 10) {
      changed = false;
      passes++;

      // Keep only largest connected component first to avoid fixing disconnected noise
      const visited: boolean[][] = Array(height).fill(false).map(() => Array(width).fill(false));
      let largestComponent: {x:number, y:number}[] = [];
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (grid[y][x] && !visited[y][x]) {
            const comp: {x:number, y:number}[] = [];
            const queue = [{x, y}];
            visited[y][x] = true;
            
            while(queue.length > 0) {
              const curr = queue.shift()!;
              comp.push(curr);
              
              const neighbors = [
                {x: curr.x, y: curr.y-1}, {x: curr.x, y: curr.y+1},
                {x: curr.x-1, y: curr.y}, {x: curr.x+1, y: curr.y}
              ];
              
              for (const n of neighbors) {
                if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height && grid[n.y][n.x] && !visited[n.y][n.x]) {
                  visited[n.y][n.x] = true;
                  queue.push(n);
                }
              }
            }
            if (comp.length > largestComponent.length) {
              largestComponent = comp;
            }
          }
        }
      }
      
      // Clear everything not in largest component
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          grid[y][x] = false;
        }
      }
      for (const cell of largestComponent) {
        grid[cell.y][cell.x] = true;
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!grid[y][x]) continue;

          const N = y > 0 && grid[y-1][x];
          const S = y < height-1 && grid[y+1][x];
          const E = x < width-1 && grid[y][x+1];
          const W = x > 0 && grid[y][x-1];
          
          let cardinals = (N?1:0) + (S?1:0) + (E?1:0) + (W?1:0);

          // Rule: Minimum cardinal connections is 2 (prune peninsulas)
          if (cardinals < 2) {
            grid[y][x] = false;
            changed = true;
            continue;
          }

          // Rule: No 1xN bridges (exactly 2 opposite connections)
          if (cardinals === 2) {
            if (N && S) {
              // Vertical bridge: thicken East
              if (x < width - 1) grid[y][x+1] = true;
              changed = true;
            } else if (E && W) {
              // Horizontal bridge: thicken South
              if (y < height - 1) grid[y+1][x] = true;
              changed = true;
            }
          }

          // Rule: Prevent double inner corners (our tileset only has single inner corners)
          if (cardinals === 4) {
            const NE = grid[y-1][x+1];
            const SE = grid[y+1][x+1];
            const SW = grid[y+1][x-1];
            const NW = grid[y-1][x-1];
            
            const waterDiags = (!NE?1:0) + (!SE?1:0) + (!SW?1:0) + (!NW?1:0);
            if (waterDiags > 1) {
              // Fill water diagonals to prevent double inner corners
              if (!NE) grid[y-1][x+1] = true;
              else if (!SE) grid[y+1][x+1] = true;
              else if (!SW) grid[y+1][x-1] = true;
              else if (!NW) grid[y-1][x-1] = true;
              changed = true;
            }
          }
        }
      }
    }

    // 4. Auto-Tiling
    const result: MapGridCell[][] = [];
    for (let y = 0; y < height; y++) {
      const row: MapGridCell[] = [];
      for (let x = 0; x < width; x++) {
        const isLand = grid[y][x];
        let tileId: string | null = null;
        
        if (isLand) {
          const N = y > 0 && grid[y-1][x] ? 1 : 0;
          const S = y < height - 1 && grid[y+1][x] ? 1 : 0;
          const E = x < width - 1 && grid[y][x+1] ? 1 : 0;
          const W = x > 0 && grid[y][x-1] ? 1 : 0;
          
          let NE = 1, SE = 1, SW = 1, NW = 1;
          if (N && E) NE = grid[y-1][x+1] ? 1 : 0;
          if (S && E) SE = grid[y+1][x+1] ? 1 : 0;
          if (S && W) SW = grid[y+1][x-1] ? 1 : 0;
          if (N && W) NW = grid[y-1][x-1] ? 1 : 0;
          
          tileId = this.getTileId(N, E, S, W, NE, SE, SW, NW);
        }
        
        row.push({ x, y, isLand, tileId, objects: [] });
      }
      result.push(row);
    }
    
    // 5. Object Scattering Pass
    if (objectAssets && objectAssets.length > 0) {
      const rngScatter = new SeededRandom(seed + 12345);
      
      const occupancy = new Set<string>();

      const isSlotValid = (gx: number, gy: number, filterCenterOnly: boolean) => {
        const cx = Math.floor(gx / 3);
        const cy = Math.floor(gy / 3);
        if (cy < 0 || cy >= height || cx < 0 || cx >= width) return false;
        const cell = result[cy][cx];
        if (!cell || !cell.isLand || !cell.tileId) return false;
        if (filterCenterOnly && cell.tileId !== 'CenterFill') return false;
        return !occupancy.has(`${gx},${gy}`);
      };

      for (const asset of objectAssets) {
        if (!asset.amount || asset.amount <= 0) continue;
        const rawBaseTiles = asset.baseTiles && asset.baseTiles.length > 0 ? asset.baseTiles : [{lx: 0, ly: 0}];
        const limit = Math.floor(1.5 * (asset.scale || 1.0));
        let baseTiles = rawBaseTiles.filter((t: {lx: number, ly: number}) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
        if (baseTiles.length === 0) baseTiles = [{lx: 0, ly: 0}];
        
        // Use an isolated RNG per asset so "Vary" doesn't cascade and scramble other assets
        const assetStrVal = Array.from(asset.id).reduce((sum: number, char: any) => sum + char.charCodeAt(0), 0);
        const assetSeed = seed + 12345 + (asset.seedOffset || 0) * 1000 + assetStrVal;
        const assetRng = new SeededRandom(assetSeed);

        const availablePositions: {gx: number, gy: number}[] = [];
        
        for (let gy = 0; gy < height * 3; gy++) {
          for (let gx = 0; gx < width * 3; gx++) {
             let canPlace = true;
             for (const tile of baseTiles) {
               const tgx = gx + tile.lx;
               const tgy = gy + tile.ly;
               if (!isSlotValid(tgx, tgy, !asset.allowOnEdge)) {
                 canPlace = false;
                 break;
               }
             }
             if (canPlace) availablePositions.push({gx, gy});
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
             
             result[cy][cx].objects.push({ 
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

    return result;
  }

  private static getTileId(n: number, e: number, s: number, w: number, ne: number, se: number, sw: number, nw: number): string {
    const cCode = `${n}${e}${s}${w}`;
    
    if (cCode === '1111') {
      const dCode = `${ne}${se}${sw}${nw}`;
      if (dCode === '0111') return 'InnerCornerEast';
      if (dCode === '1011') return 'InnerCornerSouth';
      if (dCode === '1101') return 'InnerCornerWest';
      if (dCode === '1110') return 'InnerCornerNorth';
      return 'CenterFill';
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
    };

    return map[cCode] || 'CenterFill';
  }
}

