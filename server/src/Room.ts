import { WebSocket } from "ws";

export class Room {
  public readyMap = new Map<WebSocket, boolean>();

  constructor(public id: string, public players: WebSocket[]) {
    players.forEach((player) => this.readyMap.set(player, false));
  }

  getOther(player: WebSocket): WebSocket | null {
    return this.players.find((item) => item !== player) ?? null;
  }

  setReady(player: WebSocket) {
    this.readyMap.set(player, true);
  }

  isReady(player: WebSocket) {
    return this.readyMap.get(player) ?? false;
  }

  bothReady() {
    return this.players.every((player) => this.readyMap.get(player) === true);
  }
}
