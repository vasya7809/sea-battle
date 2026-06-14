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
      sunkCoordinates?: { x: number; y: number }[];
    }
  | { type: "status"; message: string }
  | { type: "opponentLeft" };

// Очищено: клієнт вміє лише підключатися, підтверджувати готовність та стріляти
export type ClientMessage =
  | { type: "join" }
  | { type: "ready" }
  | { type: "shoot"; x: number; y: number };

export interface SocketHandlers {
  onOpen?: () => void;
  onMatched?: (playerNumber: 1 | 2) => void;
  onOpponentReady?: () => void;
  onShoot?: (x: number, y: number) => void;
  onShotResult?: (message: Extract<ServerMessage, { type: "shotResult" }>) => void; // Оптимізація типізації через хелпер
  onStatus?: (message: string) => void;
  onOpponentLeft?: () => void;
}

export const connectSocket = (handlers: SocketHandlers): WebSocket => {
  // Виправлено пріоритет: якщо є змінна оточення - беремо її, якщо ні - дивимось на режим збірки
  const socketUrl = import.meta.env.VITE_WS_URL || 
    (import.meta.env.PROD ? 'wss://sea-battle-idus.onrender.com' : 'ws://localhost:10000');
  
  console.log(`[WebSocket] Connecting to: ${socketUrl}`);
  
  const socket = new WebSocket(socketUrl);

  socket.addEventListener("open", () => {
    console.log("[WebSocket] Connected successfully");
    handlers.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      // Виправлено: event.data у браузері вже є string, toString() не потрібен
      const data = JSON.parse(event.data) as ServerMessage;
      console.log("[WebSocket] Message received:", data.type, data);
      
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
          handlers.onShotResult?.(data); // Спрощено передачу об'єкта
          break;
        case "status":
          handlers.onStatus?.(data.message);
          break;
        case "opponentLeft":
          handlers.onOpponentLeft?.();
          break;
        default:
          console.warn("[WebSocket] Unknown message type:", (data as any).type);
      }
    } catch (error) {
      console.error("[WebSocket] Error parsing message:", error);
      handlers.onStatus?.("Отримано некоректні дані від сервера.");
    }
  });

  socket.addEventListener("close", () => {
    console.log("[WebSocket] Connection closed");
    handlers.onOpponentLeft?.();
  });

  socket.addEventListener("error", (event) => {
    console.error("[WebSocket] Error:", event);
    handlers.onStatus?.("Не вдалося підключитися до сервера.");
  });

  return socket;
};
