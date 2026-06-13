import { WebSocket, WebSocketServer, type RawData } from "ws";
import { Room } from "./Room";

export class GameServer {
  private wss!: WebSocketServer;
  private waitingClients: WebSocket[] = [];
  private rooms = new Map<string, Room>();

  start() {
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    this.wss = new WebSocketServer({ port, host: "0.0.0.0" });

    this.wss.on("connection", (socket: WebSocket) => {
      console.log("Client connected");
      socket.on("message", (message: RawData) => this.handleMessage(socket, message.toString()));
      socket.on("close", () => this.handleClose(socket));
      socket.on("error", () => this.handleClose(socket));
    });

    // В окружениях типа Render адрес может быть ещё не доступен через this.wss.address()
    // используем значение `port`, которое мы уже получили из env или по умолчанию.
    const boundPort = port;
    console.log(`SeaBattle server started on ws://0.0.0.0:${boundPort}`);
  }

  private handleMessage(socket: WebSocket, raw: string) {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const data = payload as { type?: string } & Record<string, unknown>;
    switch (data.type) {
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
    console.log(`handleJoin: queued present? ${queued ? "yes" : "no"}, waitingClients now ${this.waitingClients.length}`);
    if (queued) {
      const roomId = this.createRoomId();
      const room = new Room(roomId, [queued, socket]);
      this.rooms.set(roomId, room);
      console.log(`Created room ${roomId} for two players`);
      this.send(queued, { type: "matched", playerNumber: 1 });
      this.send(socket, { type: "matched", playerNumber: 2 });
      this.send(queued, { type: "status", message: "Суперник знайдений. Розставте кораблі." });
      this.send(socket, { type: "status", message: "Суперник знайдений. Розставте кораблі." });
    } else {
      this.waitingClients.push(socket);
      console.log(`Added client to waitingClients (count=${this.waitingClients.length})`);
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

  private forwardToOpponent(socket: WebSocket, payload: unknown) {
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
