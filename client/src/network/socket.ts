export type ServerMessage =
  | { type: "matched"; playerNumber: 1 | 2 }
  | { type: "opponentReady" }
  | { type: "shoot"; x: number; y: number }
  | {
      type: "shotResult";
      x: number;
      y: number;
      hit: boolean;
      sunk: boolean;
      winner: boolean;
      shipSize?: number;
    }
  | { type: "status"; message: string }
  | { type: "opponentLeft" };

export type ClientMessage =
  | { type: "join" }
  | { type: "ready" }
  | { type: "shoot"; x: number; y: number }
  | {
      type: "shotResult";
      x: number;
      y: number;
      hit: boolean;
      sunk: boolean;
      winner: boolean;
      shipSize?: number;
    };

export interface SocketHandlers {
  onOpen?: () => void;
  onMatched?: (playerNumber: 1 | 2) => void;
  onOpponentReady?: () => void;
  onShoot?: (x: number, y: number) => void;
  onShotResult?: (message: {
    x: number;
    y: number;
    hit: boolean;
    sunk: boolean;
    winner: boolean;
    shipSize?: number;
  }) => void;
  onStatus?: (message: string) => void;
  onOpponentLeft?: () => void;
}

export const connectSocket = (handlers: SocketHandlers): WebSocket => {
  const hostname = window.location.hostname;
  const socket = new WebSocket(`ws://${hostname}:3000`);

  socket.addEventListener("open", () => {
    handlers.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data.toString()) as ServerMessage;
      switch (data.type) {
        case "matched":
          handlers.onMatched?.(data.playerNumber);
          break;
        case "opponentReady":
          handlers.onOpponentReady?.();
          break;
        case "shoot":
          handlers.onShoot?.(data.x, data.y);
          break;
        case "shotResult":
          handlers.onShotResult?.({
            x: data.x,
            y: data.y,
            hit: data.hit,
            sunk: data.sunk,
            winner: data.winner,
            shipSize: data.shipSize,
          });
          break;
        case "status":
          handlers.onStatus?.(data.message);
          break;
        case "opponentLeft":
          handlers.onOpponentLeft?.();
          break;
      }
    } catch (error) {
      handlers.onStatus?.("Отримано невідоме повідомлення від сервера.");
    }
  });

  socket.addEventListener("close", () => {
    handlers.onOpponentLeft?.();
  });

  socket.addEventListener("error", () => {
    handlers.onStatus?.("Не вдалося підключитися до сервера.");
  });

  return socket;
};
