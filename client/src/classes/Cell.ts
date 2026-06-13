export enum CellState {
  Empty,
  Ship,
  Hit,
  Miss,
  Blocked,
  Sunk
}

export class Cell {
  constructor(
    public x: number,
    public y: number,
    public state: CellState = CellState.Empty
  ) {}
}
