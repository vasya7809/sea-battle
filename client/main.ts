import { Game } from "./classes/Game";
import { CellState } from "./classes/Cell";

const app = document.getElementById("app");
const game = new Game();
game.start();

let nextShipIndex = 0;
let orientation: "horizontal" | "vertical" = "horizontal";

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
    turnText.textContent = game.phase === "placement"
      ? "Розстановка кораблів"
      : game.currentTurn === 1
        ? "Ваш хід"
        : "Хід суперника";
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
      game.player2.board.cells.flat().filter((cell) => cell.state === CellState.Hit).length
    );
  }
  if (missCount) {
    missCount.textContent = String(
      game.player2.board.cells.flat().filter((cell) => cell.state === CellState.Miss).length
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
    placementInfo.textContent = `Розташуйте корабель розміром ${size}, орієнтація: ${orientation}`;
  } else if (game.phase === "battle") {
    placementInfo.textContent = "Змушуйте противника промахнутися або влучити у флот.";
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

  const shipSize = game.shipSizes[nextShipIndex];
  const placed = game.placePlayerShip(x, y, shipSize, orientation);
  if (!placed) {
    updateStatus("Неможливо поставити корабель тут. Спробуйте інше місце.");
    return;
  }

  nextShipIndex += 1;
  if (nextShipIndex >= game.shipSizes.length) {
    game.completePlacement();
    updateStatus("Усі кораблі розставлені. Починайте бій!");
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
  if (game.currentTurn !== 1) {
    return;
  }

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

  if (game.phase === "ended") {
    updateStatus(`Переможець: ${game.winner?.nickname}`);
    return;
  }

  if (!result.hit) {
    setTimeout(cpuTurn, 500);
  }
}

function cpuTurn() {
  if (game.phase !== "battle" || game.currentTurn !== 2) {
    return;
  }

  const availableCells = game.player1.board.cells.flat().filter(
    (cell) => cell.state !== CellState.Hit && cell.state !== CellState.Miss
  );

  const target = availableCells[Math.floor(Math.random() * availableCells.length)];
  const result = target ? game.shootAtOpponent(target.x, target.y) : null;
  if (!result) {
    return;
  }

  const message = result.hit
    ? result.sunk
      ? "Суперник потрапив! Один корабель знищено."
      : "Суперник потрапив!"
    : "Суперник промахнувся.";

  updateStatus(message);
  renderBoards();

  if (game.phase === "ended") {
    updateStatus(`Переможець: ${game.winner?.nickname}`);
    return;
  }

  if (result.hit) {
    setTimeout(cpuTurn, 500);
    return;
  }

  updateStatus("Ваш хід.");
}

function updateBoardStyles() {
  const panels = document.querySelectorAll(".board-panel");
  panels.forEach((panel) => {
    const owner = panel.dataset.owner;
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
      } else {
        if (state === CellState.Hit) {
          cell.classList.add("cell-hit");
        }
        if (state === CellState.Miss) {
          cell.classList.add("cell-miss");
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

function resetGame() {
  game.start();
  nextShipIndex = 0;
  orientation = "horizontal";
  renderUI();
  updatePlacementInfo();
}

function renderUI() {
  if (!app) {
    return;
  }

  app.innerHTML = `
    <div class="page-shell">
      <header class="hero">
        <div>
          <span class="eyebrow">SeaBattle</span>
          <h1>Морський бій</h1>
          <p>Розставляйте кораблі, стріляйте по противнику і визначайте переможця.</p>
        </div>
        <div class="hero-actions">
          <button id="newGameBtn" class="primary-btn">Нова гра</button>
          <button id="rotateBtn" class="secondary-btn">Поворот: Горизонтально</button>
        </div>
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
        </aside>

        <div class="boards-wrapper"></div>
      </main>
    </div>
  `;

  const boardsWrapper = document.querySelector(".boards-wrapper");
  if (boardsWrapper) {
    boardsWrapper.appendChild(createBoardGrid("Твоє поле", "player"));
    boardsWrapper.appendChild(createBoardGrid("Поле противника", "enemy"));
  }

  const newGameBtn = document.getElementById("newGameBtn");
  const rotateBtn = document.getElementById("rotateBtn");

  newGameBtn?.addEventListener("click", () => {
    resetGame();
  });

  rotateBtn?.addEventListener("click", () => {
    orientation = orientation === "horizontal" ? "vertical" : "horizontal";
    rotateBtn.textContent = `Поворот: ${orientation === "horizontal" ? "Горизонтально" : "Вертикально"}`;
    updatePlacementInfo();
  });

  renderBoards();
  updatePlacementInfo();
}

renderUI();
