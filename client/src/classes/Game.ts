import { Player } from "./Player";
import { CellState } from "./Cell";

export type Phase = "placement" | "battle" | "ended";

export interface ShotResult {
  hit: boolean;
  sunk: boolean;
  winner: boolean;
  shipSize?: number;
  sunkCoordinates?: { x: number; y: number }[];
}

export class Game {
  player1: Player;
  player2: Player;
  // 1 ship of size 4, 2 ships of size 3, 3 ships of size 2, 4 ships of size 1
  shipSizes = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  currentTurn = 1;
  phase: Phase = "placement";
  winner: Player | null = null;

  constructor() {
    this.player1 = new Player("1", "Ви");
    this.player2 = new Player("2", "Суперник");
    this.start();
  }

  start() {
    this.player1 = new Player("1", "Ви");
    this.player2 = new Player("2", "Суперник");
    this.currentTurn = 1;
    this.phase = "placement";
    this.winner = null;
  }

  placePlayerShip(x: number, y: number, size: number, orientation: "horizontal" | "vertical") {
    return this.player1.board.placeShipAt(x, y, size, orientation);
  }

  completePlacement() {
    return this.player1.board.ships.length >= this.shipSizes.length;
  }

  shootAtOpponent(x: number, y: number) {
    if (this.phase !== "battle") {
      return null;
    }

    const result = this.player2.board.receiveShot(x, y);
    if (!result) {
      return null;
    }

    if (result.winner) {
      this.phase = "ended";
      this.winner = this.player1;
    }

    this.currentTurn = result.hit ? 1 : 2;
    return result;
  }

  receiveRemoteShot(x: number, y: number) {
    if (this.phase !== "battle") {
      return null;
    }

    const result = this.player1.board.receiveShot(x, y);
    if (!result) {
      return null;
    }

    if (result.winner) {
      this.phase = "ended";
      this.winner = this.player2;
    }

    this.currentTurn = result.hit ? 2 : 1;
    return result;
  }

  updateEnemyBoardShotResult(x: number, y: number, hit: boolean, sunkCoordinates?: { x: number; y: number }[]) {
    const cell = this.player2.board.getCell(x, y);
    if (!cell) {
      return;
    }

    cell.state = hit ? CellState.Hit : CellState.Miss;
    if (sunkCoordinates && hit) {
      sunkCoordinates.forEach(({ x: sx, y: sy }) => {
        const sunkCell = this.player2.board.getCell(sx, sy);
        if (sunkCell) {
          sunkCell.state = CellState.Sunk;
        }

        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const adjacent = this.player2.board.getCell(sx + offsetX, sy + offsetY);
            if (adjacent && adjacent.state === CellState.Empty) {
              adjacent.state = CellState.Miss;
            }
          }
        }
      });
    }
  }

  placeBotShips() {
    for (const size of this.shipSizes) {
      let placed = false;
      while (!placed) {
        const orientation = Math.random() < 0.5 ? "horizontal" : "vertical";
        const maxX = orientation === "horizontal" ? 10 - size : 9;
        const maxY = orientation === "vertical" ? 10 - size : 9;
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        placed = this.player2.board.placeShipAt(x, y, size, orientation);
      }
    }
  }
}
