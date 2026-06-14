import "./style.css";
import { Game } from "./classes/Game";
import type { ShotResult } from "./classes/Game";
import { CellState } from "./classes/Cell";
import { connectSocket } from "./network/socket";

const app = document.getElementById("app");
const game = new Game();

type UIStage = "menu" | "placement" | "battle";
let uiStage: UIStage = "menu";

type GameMode = "bot" | "online";

let nextShipIndex = 0;
let orientation: "horizontal" | "vertical" = "horizontal";
let gameMode: GameMode = "bot";
let playerNumber: 1 | 2 = 1;
let socket: WebSocket | null = null;
let opponentReady = false;
let localReady = false;
let connectionStatus = "Оберіть режим гри";
let botTargetQueue: { x: number; y: number }[] = [];
let showVictoryModal = false;
let victoryMessage = "";

function createBoard(title: string, owner: "player" | "enemy"): HTMLElement {
  const boardContainer = document.createElement("section");
  boardContainer.className = "board-panel";
  boardContainer.dataset.owner = owner;

  const boardTitle = document.createElement("h2");
  boardTitle.textContent = title;
  boardContainer.appendChild(boardTitle);

  const board = document.createElement("div");
  board.className = "board-grid";

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement("button");
      cell.className = "board-cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.title = `${String.fromCharCode(65 + y)}${x + 1}`;
      board.appendChild(cell);
    }
  }

  boardContainer.appendChild(board);
  return boardContainer;
}

function updateStatus(message: string) {
  const statusText = document.getElementById("statusText");
  if (statusText) {
    statusText.textContent = message;
  }
}

function updateMeta() {
  const turnText = document.getElementById("turnText");
  const shotText = document.getElementById("shotText");
  if (turnText) {
    if (game.phase === "placement") {
      turnText.textContent = "Розстановка кораблів";
    } else {
      turnText.textContent =
        game.currentTurn === playerNumber ? "Ваш хід" : "Хід суперника";
    }
  }
  if (shotText) {
    shotText.textContent = `Хід ${game.currentTurn}`;
  }
}

function updateStats() {
  const shipCount = document.getElementById("shipCount");
  const hitCount = document.getElementById("hitCount");
  const missCount = document.getElementById("missCount");
  if (shipCount) {
    shipCount.textContent = String(game.player1.board.ships.length);
  }
  if (hitCount) {
    hitCount.textContent = String(
      game.player2.board.cells
        .flat()
        .filter((cell) => cell.state === CellState.Hit).length
    );
  }
  if (missCount) {
    missCount.textContent = String(
      game.player2.board.cells
        .flat()
        .filter((cell) => cell.state === CellState.Miss).length
    );
  }
}

function updatePlacementInfo() {
  const placementInfo = document.getElementById("placementInfo");
  if (!placementInfo) {
    return;
  }

  if (game.phase === "placement") {
    const size = game.shipSizes[nextShipIndex];
    if (gameMode === "online") {
      placementInfo.textContent = `Розташуйте корабель розміром ${size}, орієнтація: ${orientation}. Після розстановки чекайте суперника.`;
    } else {
      placementInfo.textContent = `Розташуйте корабель розміром ${size}, орієнтація: ${orientation}.`;
    }
  } else if (game.phase === "battle") {
    placementInfo.textContent = "Ведете бій. Виберіть клітинку на полі супротивника.";
  } else {
    placementInfo.textContent = "Гра завершена. Натисніть 'Нова гра', щоб почати знову.";
  }
}

function createBoardGrid(title: string, owner: "player" | "enemy"): HTMLElement {
  const panel = createBoard(title, owner);
  const grid = panel.querySelector(".board-grid");
  if (!grid) {
    return panel;
  }

  grid.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("board-cell")) {
      return;
    }

    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return;
    }

    if (owner === "player") {
      handlePlayerBoardClick(x, y);
    } else {
      handleEnemyBoardClick(x, y);
    }
  });

  return panel;
}

function handlePlayerBoardClick(x: number, y: number) {
  if (game.phase !== "placement") {
    return;
  }

  // If all ships already placed or marked ready, ignore further clicks
  if (nextShipIndex >= game.shipSizes.length || localReady) {
    return;
  }

  const shipSize = game.shipSizes[nextShipIndex];
  const placed = game.placePlayerShip(x, y, shipSize, orientation);
  if (!placed) {
    updateStatus("Неможливо поставити корабель тут. Спробуйте інше місце.");
    return;
  }

  nextShipIndex += 1;
  if (nextShipIndex >= game.shipSizes.length) {
    // Completed placement
    localReady = true;
    updateStatus("Ви готові. Натисніть 'Розпочати бій', щоб перейти до бою.");
    if (gameMode === "online") {
      sendSocketMessage({ type: "ready" });
    }
    // Re-render UI so begin button is enabled/visible state updates
    renderUI();
  } else {
    updateStatus(`Корабель розміру ${shipSize} встановлено. Розташуйте наступний.`);
  }

  renderBoards();
  updatePlacementInfo();
}

function handleEnemyBoardClick(x: number, y: number) {
  if (game.phase !== "battle") {
    return;
  }

  if (game.currentTurn !== playerNumber) {
    updateStatus("Зараз не ваш хід.");
    return;
  }

  const targetCell = game.player2.board.getCell(x, y);
  if (!targetCell || targetCell.state === CellState.Hit || targetCell.state === CellState.Miss) {
    return;
  }

  if (gameMode === "bot") {
    const result = game.shootAtOpponent(x, y);
    if (!result) {
      return;
    }

    const message = result.hit
      ? result.sunk
        ? "Влучання! Корабель знищено."
        : "Влучання!"
      : "Промах.";

    updateStatus(message);
    renderBoards();

    if (result.winner) {
      updateStatus(`Переможець: ${game.winner?.nickname}`);
      openVictoryModal(game.winner?.nickname === "Ви" ? "Ви перемогли!" : "Ви програли...");
      renderUI();
      return;
    }

    if (!result.hit) {
      setTimeout(cpuTurn, 500);
    }

    return;
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    updateStatus("Немає підключення до сервера.");
    return;
  }

  updateStatus("Надсилаю постріл супротивнику...");
  sendSocketMessage({ type: "shoot", x, y });
}

function getBotTarget() {
  while (botTargetQueue.length > 0) {
    const target = botTargetQueue.shift()!;
    const cell = game.player1.board.getCell(target.x, target.y);
    if (!cell) {
      continue;
    }
    if (cell.state !== CellState.Hit && cell.state !== CellState.Miss && cell.state !== CellState.Sunk && cell.state !== CellState.Blocked) {
      return target;
    }
  }

  const availableCells = game.player1.board.cells
    .flat()
    .filter(
      (cell) =>
        cell.state !== CellState.Hit &&
        cell.state !== CellState.Miss &&
        cell.state !== CellState.Sunk &&
        cell.state !== CellState.Blocked
    );

  if (availableCells.length === 0) {
    return null;
  }

  return availableCells[Math.floor(Math.random() * availableCells.length)];
}

function addBotNeighbors(x: number, y: number) {
  const neighbors = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];

  neighbors.forEach((neighbor) => {
    if (neighbor.x < 0 || neighbor.x > 9 || neighbor.y < 0 || neighbor.y > 9) {
      return;
    }

    const cell = game.player1.board.getCell(neighbor.x, neighbor.y);
    if (!cell || cell.state === CellState.Hit || cell.state === CellState.Miss || cell.state === CellState.Sunk || cell.state === CellState.Blocked) {
      return;
    }

    const exists = botTargetQueue.some((item) => item.x === neighbor.x && item.y === neighbor.y);
    if (!exists) {
      botTargetQueue.push(neighbor);
    }
  });
}

function cpuTurn() {
  if (game.phase !== "battle") {
    return;
  }

  // Bot should act only when it's not the player's turn
  if (gameMode === "bot" && game.currentTurn === 2) {
    const target = getBotTarget();
    if (!target) {
      return;
    }

    const result = game.receiveRemoteShot(target.x, target.y);
    showLastMove(target.x, target.y, "player");

    if (!result) {
      return;
    }

    if (result.hit && !result.sunk) {
      addBotNeighbors(target.x, target.y);
    }

    if (result.sunk) {
      botTargetQueue = [];
    }

    const message = result.hit
      ? result.sunk
        ? "Суперник потрапив! Один корабель знищено."
        : "Суперник потрапив!"
      : "Суперник промахнувся.";

    updateStatus(message);
    renderBoards();

    if (result.winner) {
      updateStatus(`Переможець: ${game.winner?.nickname}`);
      openVictoryModal(game.winner?.nickname === "Ви" ? "Ви перемогли!" : "Ви програли...");
      renderUI();
      return;
    }

    if (result.hit) {
      setTimeout(cpuTurn, 500);
      return;
    }

    updateStatus("Ваш хід.");
    return;
  }

  // In online mode cpuTurn shouldn't be used; server drives opponent moves
}

function showLastMove(x: number, y: number, owner: "player" | "enemy") {
  const selectorOwner = owner === "player" ? '.board-panel[data-owner="player"]' : '.board-panel[data-owner="enemy"]';
  const panel = document.querySelector(selectorOwner);
  if (!panel) return;
  const cell = panel.querySelector<HTMLButtonElement>(`.board-cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;
  cell.classList.add("last-move");
  setTimeout(() => cell.classList.remove("last-move"), 700);
}

function updateBoardStyles() {
  const panels = document.querySelectorAll(".board-panel");
  panels.forEach((panel) => {
    const owner = (panel as HTMLElement).dataset.owner;
    const grid = panel.querySelectorAll<HTMLButtonElement>(".board-cell");
    grid.forEach((cell) => {
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      if (Number.isNaN(x) || Number.isNaN(y)) {
        return;
      }

      cell.className = "board-cell";
      const board = owner === "player" ? game.player1.board : game.player2.board;
      const state = board.getCell(x, y)?.state;

      if (owner === "player") {
        if (state === CellState.Ship) {
          cell.classList.add("cell-ship");
        }
        if (state === CellState.Hit) {
          cell.classList.add("cell-hit");
        }
        if (state === CellState.Miss) {
          cell.classList.add("cell-miss");
        }
        if (state === CellState.Blocked) {
          cell.classList.add("cell-blocked");
        }
        if (state === CellState.Sunk) {
          cell.classList.add("cell-sunk");
        }
      } else {
        if (state === CellState.Hit) {
          cell.classList.add("cell-hit");
        }
        if (state === CellState.Miss) {
          cell.classList.add("cell-miss");
        }
        if (state === CellState.Sunk) {
          cell.classList.add("cell-sunk");
        }
        if (game.phase === "ended" && state === CellState.Ship) {
          cell.classList.add("cell-ship-reveal");
        }
      }
    });
  });
}

function renderBoards() {
  updateBoardStyles();
  updateMeta();
  updateStats();
}

function closeSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
}

function openVictoryModal(message: string) {
  showVictoryModal = true;
  victoryMessage = message;
}

function hideVictoryModal() {
  showVictoryModal = false;
  victoryMessage = "";
}

function sendSocketMessage(message: object) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

function startBattle() {
  game.player1.board.clearBlockedCells();
  game.player2.board.clearBlockedCells();
  game.phase = "battle";
  game.currentTurn = playerNumber === 2 ? 2 : 1;
  botTargetQueue = [];
  if (playerNumber === 2) {
    updateStatus("Противник починає. Чекайте свого ходу.");
  } else {
    updateStatus("Починайте бій. Ваш хід.");
  }
  renderBoards();
}

function handleSocketMatched(player: 1 | 2) {
  playerNumber = player;
  connectionStatus = `Підключено. Ви гравець ${playerNumber}.`;
  updateStatus("Коли обидва гравці готові, почнеться бій.");
  renderUI();
}

function handleSocketShoot(x: number, y: number) {
  const result = game.receiveRemoteShot(x, y);
  if (!result) {
    return;
  }

  showLastMove(x, y, "player");

  renderBoards();
  sendSocketMessage({
    type: "shotResult",
    x,
    y,
    hit: result.hit,
    sunk: result.sunk,
    winner: result.winner,
    shipSize: result.shipSize,
    sunkCoordinates: result.sunkCoordinates,
  });

  if (game.phase === "ended") {
    updateStatus("Ви програли. Суперник знищив усі ваші кораблі.");
    openVictoryModal("Ви програли...");
    renderUI();
    return;
  }
  updateStatus("Противник зробив постріл. Ваш хід, якщо він промахнувся.");
}

function handleSocketShotResult(message: ShotResult & { x: number; y: number; sunkCoordinates?: { x: number; y: number }[] }) {
  game.updateEnemyBoardShotResult(message.x, message.y, message.hit, message.sunkCoordinates);
  renderBoards();

  if (message.winner) {
    game.phase = "ended";
    game.winner = game.player1;
    updateStatus("Ви перемогли!");
    openVictoryModal("Ви перемогли!");
    renderUI();
    return;
  }

  if (message.hit) {
    updateStatus("Влучання! Ви можете стріляти ще раз.");
    game.currentTurn = playerNumber;
  } else {
    updateStatus("Промах. Тепер хід суперника.");
    game.currentTurn = playerNumber === 1 ? 2 : 1;
  }
}

function connectToServer() {
  if (socket) {
    socket.close();
    socket = null;
  }

  connectionStatus = "Підключення до сервера...";
  renderUI();

  socket = connectSocket({
    onOpen() {
      connectionStatus = "Підключено до сервера. Чекаю суперника...";
      renderUI();
      sendSocketMessage({ type: "join" });
    },
    onMatched(player) {
      handleSocketMatched(player);
    },
    onOpponentReady() {
      opponentReady = true;
      updateStatus("Суперник готовий.");
      renderUI();
    },
    onShoot(x, y) {
      handleSocketShoot(x, y);
    },
    onShotResult(message) {
      handleSocketShotResult(message);
    },
    onStatus(message) {
      connectionStatus = message;
      renderUI();
    },
    onOpponentLeft() {
      connectionStatus = "Суперник залишив гру.";
      updateStatus("Суперник від'єднався. Спробуйте знову або оберіть режим проти бота.");
      renderUI();
    },
  });
}

function startGame() {
  hideVictoryModal();
  game.start();
  nextShipIndex = 0;
  orientation = "horizontal";
  localReady = false;
  opponentReady = false;
  playerNumber = 1;
  botTargetQueue = [];

  if (gameMode === "bot") {
    game.placeBotShips();
    connectionStatus = "Режим: гра проти бота.";
    updateStatus("Розставляйте кораблі на своєму полі.");
  } else {
    connectionStatus = "Режим: онлайн. Підключення до сервера...";
    updateStatus("Розставляйте свої кораблі. Після цього чекайте суперника.");
    connectToServer();
  }

  renderUI();
  updatePlacementInfo();
}

function resetGame() {
  startGame();
}

function renderUI() {
  if (!app) return;

  if (uiStage === "menu") {
    app.innerHTML = `
      <div class="page-shell">
        <header class="hero">
          <div>
            <span class="eyebrow">SeaBattle</span>
            <h1>Морський бій</h1>
            <p>Оберіть режим гри та натисніть Розпочати.</p>
          </div>
        </header>

        <main style="display:flex;justify-content:center;align-items:center;height:60vh;">
          <div class="board-panel" style="width:420px;text-align:center;">
            <h2>Режим гри</h2>
            <select id="menuModeSelect" style="width:80%;padding:8px;margin:12px 0;">
              <option value="bot" ${gameMode === "bot" ? "selected" : ""}>Проти бота</option>
              <option value="online" ${gameMode === "online" ? "selected" : ""}>Проти гравця</option>
            </select>
            <div style="margin-top:16px;">
              <button id="menuStartBtn" class="primary-btn">Розпочати</button>
            </div>
          </div>
        </main>
      </div>
    `;

    const menuModeSelect = document.getElementById("menuModeSelect") as HTMLSelectElement | null;
    const menuStartBtn = document.getElementById("menuStartBtn");
    menuModeSelect?.addEventListener("change", (e) => {
      gameMode = (e.target as HTMLSelectElement).value as GameMode;
    });
    menuStartBtn?.addEventListener("click", () => {
      uiStage = "placement";
      startGame();
    });

    return;
  }

  // placement or battle screens
  app.innerHTML = `
    <div class="page-shell">
      <header class="hero">
        <div>
          <span class="eyebrow">SeaBattle</span>
          <h1>Морський бій</h1>
          <p>Гра проти бота або реального супротивника через мережу.</p>
        </div>
        <div class="hero-actions">
          <select id="modeSelect" class="mode-select">
            <option value="bot" ${gameMode === "bot" ? "selected" : ""}>Проти бота</option>
            <option value="online" ${gameMode === "online" ? "selected" : ""}>Проти гравця</option>
          </select>
          ${uiStage === "menu" || uiStage === "ended" ? '<button id="newGameBtn" class="primary-btn">Нова гра</button>' : ''}
          <button id="rotateBtn" class="secondary-btn">Поворот: ${orientation === "horizontal" ? "Горизонтально" : "Вертикально"}</button>
        </div>
        <div class="connection-status" id="connectionStatus">${connectionStatus}</div>
      </header>

      <section class="status-card">
        <div>
          <strong>Статус:</strong>
          <span id="statusText">Почніть розстановку кораблів.</span>
        </div>
        <div class="status-meta">
          <span id="turnText">Розстановка кораблів</span>
          <span id="shotText">Хід 1</span>
        </div>
      </section>

      <main class="game-grid">
        <aside class="info-panel">
          <h2>Панель команди</h2>
          <p>Розташуй свої кораблі на полі, потім стріляй по полю противника.</p>
          <div class="board-controls">
            <div class="placement-info" id="placementInfo"></div>
          </div>
          <div class="stats-box">
            <div><strong>Кораблі:</strong> <span id="shipCount">0</span></div>
            <div><strong>Попадання:</strong> <span id="hitCount">0</span></div>
            <div><strong>Промахи:</strong> <span id="missCount">0</span></div>
          </div>
          ${uiStage === "placement" ? '<div style="margin-top:12px"><button id="beginBattleBtn" class="primary-btn" disabled>Розпочати бій</button></div>' : ''}
        </aside>

        <div class="boards-wrapper"></div>
      </main>
    </div>
  `;

  const modeSelect = document.getElementById("modeSelect") as HTMLSelectElement | null;
  const newGameBtn = document.getElementById("newGameBtn");
  const rotateBtn = document.getElementById("rotateBtn");
  const beginBattleBtn = document.getElementById("beginBattleBtn") as HTMLButtonElement | null;

  modeSelect?.addEventListener("change", (event) => {
    const selected = (event.target as HTMLSelectElement).value as GameMode;
    if (selected !== gameMode) {
      gameMode = selected;
      resetGame();
    }
  });

  newGameBtn?.addEventListener("click", () => {
    uiStage = "menu";
    renderUI();
  });

  rotateBtn?.addEventListener("click", () => {
    orientation = orientation === "horizontal" ? "vertical" : "horizontal";
    rotateBtn.textContent = `Поворот: ${orientation === "horizontal" ? "Горизонтально" : "Вертикально"}`;
    updatePlacementInfo();
  });

  beginBattleBtn?.addEventListener("click", () => {
    if (!localReady) return;
    if (gameMode === "online" && !opponentReady) {
      updateStatus("Очікування суперника...");
      return;
    }
    uiStage = "battle";
    startBattle();
    renderUI();
  });

  const boardsWrapper = document.querySelector(".boards-wrapper");
  if (boardsWrapper) {
    boardsWrapper.innerHTML = "";
    // During placement show only the player's board. During battle show both.
    boardsWrapper.appendChild(createBoardGrid("Твоє поле", "player"));
    if (uiStage === "battle") {
      boardsWrapper.appendChild(createBoardGrid("Поле противника", "enemy"));
    }
  }

  renderBoards();
  updatePlacementInfo();
  // update begin button enabled state
  const beginBtn = document.getElementById("beginBattleBtn") as HTMLButtonElement | null;
  if (beginBtn) {
    if (gameMode === "online") {
      beginBtn.disabled = !localReady || !opponentReady;
    } else {
      beginBtn.disabled = !localReady;
    }
  }

  if (showVictoryModal) {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card">
        <h2>${victoryMessage}</h2>
        <div class="modal-buttons">
          <button id="modalNewGameBtn" class="primary-btn">Нова гра</button>
          <button id="modalExitBtn" class="secondary-btn">Вийти</button>
        </div>
      </div>
    `;
    app.appendChild(modal);

    const modalNewGameBtn = document.getElementById("modalNewGameBtn");
    const modalExitBtn = document.getElementById("modalExitBtn");

    modalNewGameBtn?.addEventListener("click", () => {
      hideVictoryModal();
      uiStage = "placement";
      startGame();
    });

    modalExitBtn?.addEventListener("click", () => {
      hideVictoryModal();
      closeSocket();
      uiStage = "menu";
      renderUI();
    });
  }
}

// show initial menu
renderUI();
