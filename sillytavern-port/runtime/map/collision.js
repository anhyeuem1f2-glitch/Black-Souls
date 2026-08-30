const directionBit = { 2: 0x01, 4: 0x02, 6: 0x04, 8: 0x08 };

export class CollisionMap {
  constructor(map, tileset) {
    this.map = map;
    this.flags = tileset?.flags?.data ?? [];
  }

  tile(x, y, z) {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return 0;
    return this.map.data.data[x + y * this.map.width + z * this.map.width * this.map.height] ?? 0;
  }

  regionId(x, y) { return this.tile(x, y, 3) >> 8; }

  passable(x, y, direction) {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    const bit = directionBit[direction];
    if (!bit) return true;
    for (let z = 2; z >= 0; z -= 1) {
      const tileId = this.tile(x, y, z);
      const flag = this.flags[tileId] ?? 0;
      if ((flag & 0x10) !== 0) continue;
      return (flag & bit) === 0;
    }
    return false;
  }
}
