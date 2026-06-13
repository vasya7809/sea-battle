export class Ship {
  hits = 0;

  constructor(
    public size: number,
    public coordinates: { x: number; y: number }[]
  ) {}

  hit() {
    this.hits++;
  }

  isDestroyed(): boolean {
    return this.hits >= this.size;
  }
}
