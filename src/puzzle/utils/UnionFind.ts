// Union-Find (Disjoint Set Union) data structure for efficient connectivity tracking

export class UnionFind<T> {
  private parent: Map<T, T> = new Map();
  private rank: Map<T, number> = new Map();
  private _componentCount = 0;

  // Add an element (creates singleton set if not exists)
  add(x: T): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      this._componentCount++;
    }
  }

  // Find the root of an element with path compression
  find(x: T): T {
    if (!this.parent.has(x)) {
      this.add(x);
      return x;
    }

    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }

    // Path compression: point all nodes directly to root
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }

    return root;
  }

  // Union two elements' sets
  union(x: T, y: T): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) {
      return false; // Already in same set
    }

    // Union by rank: attach smaller tree under larger tree
    const rankX = this.rank.get(rootX)!;
    const rankY = this.rank.get(rootY)!;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }

    this._componentCount--;
    return true;
  }

  // Check if two elements are in the same set
  connected(x: T, y: T): boolean {
    return this.find(x) === this.find(y);
  }

  // Get number of distinct components
  get componentCount(): number {
    return this._componentCount;
  }

  // Get all elements
  elements(): T[] {
    return [...this.parent.keys()];
  }

  // Get all elements in the same component as x
  getComponent(x: T): T[] {
    const root = this.find(x);
    return this.elements().filter(e => this.find(e) === root);
  }

  // Get all components as arrays
  getAllComponents(): T[][] {
    const components = new Map<T, T[]>();

    for (const elem of this.elements()) {
      const root = this.find(elem);
      if (!components.has(root)) {
        components.set(root, []);
      }
      components.get(root)!.push(elem);
    }

    return [...components.values()];
  }

  // Clone the union-find structure
  clone(): UnionFind<T> {
    const copy = new UnionFind<T>();
    copy.parent = new Map(this.parent);
    copy.rank = new Map(this.rank);
    copy._componentCount = this._componentCount;
    return copy;
  }

  // Check if element exists
  has(x: T): boolean {
    return this.parent.has(x);
  }

  // Get size (number of elements)
  get size(): number {
    return this.parent.size;
  }

  // Clear all data
  clear(): void {
    this.parent.clear();
    this.rank.clear();
    this._componentCount = 0;
  }
}
