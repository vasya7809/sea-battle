import { Cell, CellState } from "./Cell";
import { Ship } from "./Ship";

export class Board {
  cells: Cell[][] = [];
  ships: Ship[] = [];

  constructor() {
    for (let y = 0; y < 10; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < 10; x++) {
        row.push(new Cell(x, y, CellState.Empty));
      }
      this.cells.push(row);
    }
  }

  getCell(x: number, y: number): Cell | undefined {
    return this.cells[y]?.[x];
  }

  canPlaceShip(x: number, y: number, size: number, orientation: "horizontal" | "vertical"): boolean {
    const maxX = orientation === "horizontal" ? x + size : x;
    const maxY = orientation === "vertical" ? y + size : y;

    if (maxX > 10 || maxY > 10) {
      return false;
    }

    for (let offset = 0; offset < size; offset++) {
      const currentX = x + (orientation === "horizontal" ? offset : 0);
      const currentY = y + (orientation === "vertical" ? offset : 0);
      const cell = this.getCell(currentX, currentY);
      if (!cell || cell.state !== CellState.Empty) {
        return false;
      }
    }

    return true;
  }

  placeShipAt(x: number, y: number, size: number, orientation: "horizontal" | "vertical"): boolean {
    if (!this.canPlaceShip(x, y, size, orientation)) {
      return false;
    }

    const coordinates = [] as { x: number; y: number }[];
    for (let offset = 0; offset < size; offset++) {
      coordinates.push({
        x: x + (orientation === "horizontal" ? offset : 0),
        y: y + (orientation === "vertical" ? offset : 0),
      });
    }

    this.placeShip(new Ship(size, coordinates));
    this.markBlockedAroundShip(coordinates);
    return true;
  }

  placeShip(ship: Ship): void {
    this.ships.push(ship);
    ship.coordinates.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.state = CellState.Ship;
      }
    });
  }

  private markBlockedAroundShip(coordinates: { x: number; y: number }[]) {
    coordinates.forEach(({ x, y }) => {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const adjacent = this.getCell(x + offsetX, y + offsetY);
          if (adjacent && adjacent.state === CellState.Empty) {
            adjacent.state = CellState.Blocked;
          }
        }
      }
    });
  }

  clearBlockedCells() {
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.state === CellState.Blocked) {
          cell.state = CellState.Empty;
        }
      }
    }
  }

  receiveShot(x: number, y: number) {
    const cell = this.getCell(x, y);
    if (!cell || cell.state === CellState.Hit || cell.state === CellState.Miss || cell.state === CellState.Sunk) {
      return null;
    }

    if (cell.state === CellState.Ship) {
      cell.state = CellState.Hit;
      const ship = this.findShipAt(x, y);
      if (ship) {
        ship.hit();
        const sunk = ship.isDestroyed();
        const winner = this.ships.every((item) => item.isDestroyed());

        if (sunk) {
          this.markShipAsSunk(ship);
          this.markSurroundingCellsAsMiss(ship.coordinates);
          return {
            hit: true,
            sunk,
            winner,
            shipSize: ship.size,
            sunkCoordinates: ship.coordinates,
          };
        }

        return { hit: true, sunk: false, winner, shipSize: ship.size };
      }
      return { hit: true, sunk: false, winner: false };
    }

    cell.state = CellState.Miss;
    return { hit: false, sunk: false, winner: false };
  }

  private markShipAsSunk(ship: Ship) {
    ship.coordinates.forEach(({ x, y }) => {
      const cell = this.getCell(x, y);
      if (cell) {
        cell.state = CellState.Sunk;
      }
    });
  }

  private markSurroundingCellsAsMiss(coordinates: { x: number; y: number }[]) {
    coordinates.forEach(({ x, y }) => {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const adjacent = this.getCell(x + offsetX, y + offsetY);
          if (adjacent && adjacent.state === CellState.Empty) {
            adjacent.state = CellState.Miss;
          }
        }
      }
    });
  }

  private findShipAt(x: number, y: number): Ship | undefined {
    return this.ships.find((ship) => ship.coordinates.some((coord) => coord.x === x && coord.y === y));
  }
}
