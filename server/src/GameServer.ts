import { WebSocket, WebSocketServer } from "ws";
import { Room } from "./Room";

export class GameServer {
  private wss!: WebSocketServer;
  private waitingClients: WebSocket[] = [];
  private rooms = new Map<string, Room>();

  start() {
    this.wss = new WebSocketServer({ port: 3000, host: "0.0.0.0" });

    this.wss.on("connection", (socket) => {
      console.log("Client connected");
      socket.on("message", (message) => this.handleMessage(socket, message.toString()));
      socket.on("close", () => this.handleClose(socket));
      socket.on("error", () => this.handleClose(socket));
    });

    console.log("SeaBattle server started on ws://localhost:3000");
  }

  private handleMessage(socket: WebSocket, raw: string) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    switch (payload.type) {
      case "join":
        this.handleJoin(socket);
        break;
      case "ready":
        this.handleReady(socket);
        break;
      case "shoot":
        this.forwardToOpponent(socket, payload);
        break;
      case "shotResult":
        this.forwardToOpponent(socket, payload);
        break;
      default:
        break;
    }
  }

  private handleJoin(socket: WebSocket) {
    const queued = this.waitingClients.shift();
    if (queued) {
      const roomId = this.createRoomId();
      const room = new Room(roomId, [queued, socket]);
      this.rooms.set(roomId, room);
      this.send(queued, { type: "matched", playerNumber: 1 });
      this.send(socket, { type: "matched", playerNumber: 2 });
      this.send(queued, { type: "status", message: "Суперник знайдений. Розставте кораблі." });
      this.send(socket, { type: "status", message: "Суперник знайдений. Розставте кораблі." });
    } else {
      this.waitingClients.push(socket);
      this.send(socket, { type: "status", message: "Очікування суперника..." });
    }
  }

  private handleReady(socket: WebSocket) {
    const room = this.findRoomForClient(socket);
    if (!room) {
      return;
    }

    room.setReady(socket);
    const opponent = room.getOther(socket);
    if (!opponent) {
      return;
    }

    if (room.isReady(opponent)) {
      this.send(opponent, { type: "opponentReady" });
      this.send(socket, { type: "opponentReady" });
    } else {
      this.send(opponent, { type: "status", message: "Суперник готовий. Очікує вашої готовності." });
    }
  }

  private forwardToOpponent(socket: WebSocket, payload: any) {
    const opponent = this.findOpponent(socket);
    if (!opponent) {
      this.send(socket, { type: "status", message: "Суперник не підключений." });
      return;
    }

    this.send(opponent, payload);
  }

  private handleClose(socket: WebSocket) {
    this.removeFromQueue(socket);
    const opponent = this.findOpponent(socket);
    if (opponent) {
      this.send(opponent, { type: "opponentLeft" });
      this.removeRoomContaining(socket);
    }
  }

  private removeFromQueue(socket: WebSocket) {
    this.waitingClients = this.waitingClients.filter((client) => client !== socket);
  }

  private removeRoomContaining(socket: WebSocket) {
    const roomEntry = Array.from(this.rooms.entries()).find(([, room]) =>
      room.players.includes(socket)
    );
    if (!roomEntry) {
      return;
    }

    const [roomId] = roomEntry;
    this.rooms.delete(roomId);
  }

  private findRoomForClient(socket: WebSocket): Room | undefined {
    return Array.from(this.rooms.values()).find((room) => room.players.includes(socket));
  }

  private findOpponent(socket: WebSocket): WebSocket | null {
    const room = this.findRoomForClient(socket);
    return room ? room.getOther(socket) : null;
  }

  private send(socket: WebSocket, payload: unknown) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  private createRoomId() {
    return Math.random().toString(36).slice(2, 10);
  }
}
