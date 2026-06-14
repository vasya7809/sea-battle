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
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  // Allow overriding the websocket URL via (in order): Vite env VITE_WS_URL, global variable, or the current browser host.
  // `VITE_WS_URL` may include a full ws:// or wss:// URL, or just host[:port].
  // @ts-ignore
  const viteOverride = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WS_URL : undefined;
  const globalOverride = (window as any).__SEA_WS_URL__ as string | undefined;
  const resolved = viteOverride ?? globalOverride ?? window.location.host;
  const socketUrl = resolved.startsWith("ws://") || resolved.startsWith("wss://")
    ? resolved
    : `${protocol}://${resolved}`;
  const socket = new WebSocket(socketUrl);

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
    console.error("WebSocket error");
    handlers.onStatus?.("Не вдалося підключитися до сервера.");
  });

  return socket;
};
