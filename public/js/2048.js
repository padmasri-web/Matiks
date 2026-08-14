document.addEventListener('DOMContentLoaded', () => {
  const tileContainer = document.getElementById('tile-container');
  const currentScoreEl = document.getElementById('current-score');
  const highScoreEl = document.getElementById('high-score');
  const newGameBtn = document.getElementById('new-game-btn');
  const musicToggleBtn = document.getElementById('music-toggle-btn');

  // Modal elements
  const gameOverModalEl = document.getElementById('gameOver2048Modal');
  const modalRestartBtn = document.getElementById('modal-restart-btn');
  const modalFinalScore = document.getElementById('modal-final-score');
  const modalHighScore = document.getElementById('modal-high-score');

  // Initialize single Bootstrap modal instance (no backdrop overlay)
  let bsModal = null;
  if (gameOverModalEl && typeof bootstrap !== 'undefined') {
    bsModal = new bootstrap.Modal(gameOverModalEl, { backdrop: false });
  }

  function cleanupBackdrops() {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '0px';
    document.body.style.filter = 'none';
    document.body.style.backdropFilter = 'none';
  }

  if (gameOverModalEl) {
    gameOverModalEl.addEventListener('show.bs.modal', cleanupBackdrops);
    gameOverModalEl.addEventListener('shown.bs.modal', cleanupBackdrops);
    gameOverModalEl.addEventListener('hidden.bs.modal', cleanupBackdrops);
  }

  // Audio controller
  let isMusicEnabled = true;
  let bgMusic = new Audio('/assets/mp3/music.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.4;

  function playMusic() {
    if (!isMusicEnabled) return;
    bgMusic.play().then(() => {
      if (musicToggleBtn) musicToggleBtn.classList.remove('muted');
    }).catch(err => console.warn("Audio autoplay blocked:", err));
  }

  function pauseMusic() {
    bgMusic.pause();
    if (musicToggleBtn) musicToggleBtn.classList.add('muted');
  }

  playMusic();

  const enableAudioOnInteraction = () => {
    if (isMusicEnabled && bgMusic.paused) playMusic();
    document.removeEventListener('click', enableAudioOnInteraction);
    document.removeEventListener('keydown', enableAudioOnInteraction);
  };
  document.addEventListener('click', enableAudioOnInteraction);
  document.addEventListener('keydown', enableAudioOnInteraction);

  if (musicToggleBtn) {
    musicToggleBtn.addEventListener('click', () => {
      isMusicEnabled = !isMusicEnabled;
      if (isMusicEnabled) playMusic();
      else pauseMusic();
    });
  }

  // Board Matrix & Persistent Tile Tracking State
  let grid = [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null]
  ];
  let nextTileId = 1;
  let score = 0;
  let highScore = localStorage.getItem('2048HighScore') || 0;
  let isGameOver = false;
  let isMoving = false;

  // 2-Minute Timer State
  let timerSeconds = 120;
  let timerInterval = null;

  function startTimer() {
    clearInterval(timerInterval);
    timerSeconds = 120;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      if (isGameOver) {
        clearInterval(timerInterval);
        return;
      }

      timerSeconds--;
      updateTimerDisplay();

      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        isGameOver = true;
        handleGameOver(true); // Time's Up
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    const formattedMins = String(mins).padStart(2, '0');
    const formattedSecs = String(secs).padStart(2, '0');
    timerEl.textContent = `${formattedMins}:${formattedSecs}`;

    if (timerSeconds <= 15) {
      timerEl.style.color = '#ef4444';
    } else {
      timerEl.style.color = '#4564C6';
    }
  }

  if (highScoreEl) highScoreEl.textContent = highScore;

  // Calculate cell position in px
  function getTilePosition(row, col) {
    const containerWidth = tileContainer.clientWidth;
    const gap = 12;
    const tileSize = (containerWidth - (gap * 3)) / 4;
    return {
      left: col * (tileSize + gap),
      top: row * (tileSize + gap)
    };
  }

  // Initialize Game
  function initGame() {
    cleanupBackdrops();
    tileContainer.innerHTML = '';
    grid = [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null]
    ];
    score = 0;
    isGameOver = false;
    isMoving = false;
    nextTileId = 1;
    if (currentScoreEl) currentScoreEl.textContent = '0';

    spawnTile();
    spawnTile();
    startTimer();
  }

  // Spawn random tile (90% chance 2, 10% chance 4)
  function spawnTile() {
    const emptyCells = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!grid[r][c]) {
          emptyCells.push({ r, c });
        }
      }
    }

    if (emptyCells.length > 0) {
      const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      const value = Math.random() < 0.9 ? 2 : 4;
      const id = nextTileId++;

      // Create persistent DOM tile element
      const el = document.createElement('div');
      const tileClass = value <= 2048 ? `tile-${value}` : 'tile-super';
      el.className = `tile ${tileClass} tile-new`;
      el.textContent = value;

      const pos = getTilePosition(r, c);
      el.style.transform = `translate(${pos.left}px, ${pos.top}px)`;

      tileContainer.appendChild(el);

      grid[r][c] = {
        id,
        value,
        row: r,
        col: c,
        merged: false,
        element: el
      };
    }
  }

  // Update tile DOM element position
  function moveTileElement(tile, targetRow, targetCol) {
    const pos = getTilePosition(targetRow, targetCol);
    tile.element.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
  }

  // 2048 Movement Algorithm with GPU-accelerated smooth DOM animation
  function move(direction) {
    if (isGameOver || isMoving) return;

    let hasMoved = false;

    // Reset merged flags
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c]) grid[r][c].merged = false;
      }
    }

    const newGrid = [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null]
    ];

    const tilesToDestroy = [];

    // Helper for sliding lines
    const processLine = (lineTiles, getTargetCell) => {
      let targetIdx = 0;
      let lastTile = null;

      for (let i = 0; i < lineTiles.length; i++) {
        const tile = lineTiles[i];
        if (!tile) continue;

        if (lastTile && lastTile.value === tile.value && !lastTile.merged) {
          // Merge tile into lastTile
          const target = getTargetCell(targetIdx - 1);
          moveTileElement(tile, target.r, target.c);
          tilesToDestroy.push(tile);

          lastTile.value *= 2;
          lastTile.merged = true;
          lastTile.mergedFromValue = lastTile.value;
          score += lastTile.value;
          hasMoved = true;
        } else {
          // Move tile to empty target slot
          const target = getTargetCell(targetIdx);
          if (tile.row !== target.r || tile.col !== target.c) {
            hasMoved = true;
          }
          moveTileElement(tile, target.r, target.c);
          tile.targetRow = target.r;
          tile.targetCol = target.c;
          newGrid[target.r][target.c] = tile;
          lastTile = tile;
          targetIdx++;
        }
      }
    };

    if (direction === 'LEFT') {
      for (let r = 0; r < 4; r++) {
        const line = [grid[r][0], grid[r][1], grid[r][2], grid[r][3]];
        processLine(line, (idx) => ({ r, c: idx }));
      }
    } else if (direction === 'RIGHT') {
      for (let r = 0; r < 4; r++) {
        const line = [grid[r][3], grid[r][2], grid[r][1], grid[r][0]];
        processLine(line, (idx) => ({ r, c: 3 - idx }));
      }
    } else if (direction === 'UP') {
      for (let c = 0; c < 4; c++) {
        const line = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
        processLine(line, (idx) => ({ r: idx, c }));
      }
    } else if (direction === 'DOWN') {
      for (let c = 0; c < 4; c++) {
        const line = [grid[3][c], grid[2][c], grid[1][c], grid[0][c]];
        processLine(line, (idx) => ({ r: 3 - idx, c }));
      }
    }

    if (hasMoved) {
      isMoving = true;

      // Update Scores
      if (currentScoreEl) currentScoreEl.textContent = score;
      if (score > highScore) {
        highScore = score;
        if (highScoreEl) highScoreEl.textContent = highScore;
        localStorage.setItem('2048HighScore', highScore);
      }

      // Wait 120ms for CSS transition animation to finish
      setTimeout(() => {
        // Remove merged out tiles
        tilesToDestroy.forEach(t => {
          if (t.element && t.element.parentNode) {
            t.element.parentNode.removeChild(t.element);
          }
        });

        // Update positions & merged tile styles
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const tile = newGrid[r][c];
            if (tile) {
              tile.row = r;
              tile.col = c;
              if (tile.merged) {
                const tileClass = tile.value <= 2048 ? `tile-${tile.value}` : 'tile-super';
                tile.element.className = `tile ${tileClass} tile-merged`;
                tile.element.textContent = tile.value;
              }
            }
          }
        }

        grid = newGrid;
        spawnTile();
        isMoving = false;

        if (checkGameOver()) {
          isGameOver = true;
          handleGameOver();
        }
      }, 120);
    }
  }

  // Check Game Over (No empty cells and no adjacent equal tiles)
  function checkGameOver() {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!grid[r][c]) return false;
        const val = grid[r][c].value;
        if (c < 3 && grid[r][c + 1] && grid[r][c + 1].value === val) return false;
        if (r < 3 && grid[r + 1][c] && grid[r + 1][c].value === val) return false;
      }
    }
    return true;
  }

  function playWinSound() {
    if (!isMusicEnabled) return;
    pauseMusic();
    const winSound = new Audio('/assets/mp3/win.mp3');
    winSound.volume = 0.7;
    winSound.play().catch(err => console.warn(err));
  }

  function playLossSound() {
    if (!isMusicEnabled) return;
    pauseMusic();
    const lossSound = new Audio('/assets/mp3/loss.mp3');
    lossSound.volume = 0.7;
    lossSound.play().catch(err => console.warn(err));
  }

  // Handle Game Over
  async function handleGameOver(isTimeUp = false) {
    if (timerInterval) clearInterval(timerInterval);

    const modalTitleEl = document.getElementById('gameOver2048ModalLabel');
    const modalSubtitleEl = document.getElementById('modal-2048-subtitle');
    const modalIconEl = document.getElementById('modal-icon-badge');

    // Check if player reached 2048
    let reached2048 = false;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] && grid[r][c].value >= 2048) {
          reached2048 = true;
          break;
        }
      }
    }

    if (isTimeUp) {
      if (modalIconEl) {
        modalIconEl.textContent = '⏱️';
        modalIconEl.style.background = 'rgba(239, 68, 68, 0.15)';
      }
      if (modalTitleEl) modalTitleEl.textContent = "Time's Up!";
      if (modalSubtitleEl) modalSubtitleEl.textContent = '2 minutes expired! Try to reach 2048 faster next time.';
      playLossSound();
    } else if (reached2048) {
      if (modalIconEl) {
        modalIconEl.textContent = '🏆';
        modalIconEl.style.background = 'rgba(255, 210, 63, 0.2)';
      }
      if (modalTitleEl) modalTitleEl.textContent = '🎉 Victory!';
      if (modalSubtitleEl) modalSubtitleEl.textContent = 'Incredible! You joined matching tiles and reached 2048!';
      playWinSound();
    } else {
      if (modalIconEl) {
        modalIconEl.textContent = '💀';
        modalIconEl.style.background = 'rgba(239, 68, 68, 0.15)';
      }
      if (modalTitleEl) modalTitleEl.textContent = 'Game Over!';
      if (modalSubtitleEl) modalSubtitleEl.textContent = 'No more valid moves possible on the board!';
      playLossSound();
    }

    if (modalFinalScore) modalFinalScore.textContent = score;
    if (modalHighScore) modalHighScore.textContent = highScore;

    if (bsModal) {
      bsModal.show();
    }

    // Quest System Integration
    try {
      await fetch('/api/quests/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameTarget: '2048',
          actionType: 'score_achieved',
          amount: score
        })
      });
    } catch (err) {
      console.warn("Could not sync quest progress:", err);
    }

    // Gamelog history
    try {
      await fetch('/api/user/gamelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'Puzzle',
          mode: '2048',
          playerScore: score,
          opponentName: 'Solo AI',
          opponentScore: 0
        })
      });
    } catch (err) {
      console.warn("Could not log match result:", err);
    }
  }

  // Controls & Touch Events
  document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'ArrowLeft') move('LEFT');
      if (e.key === 'ArrowRight') move('RIGHT');
      if (e.key === 'ArrowUp') move('UP');
      if (e.key === 'ArrowDown') move('DOWN');
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  const boardWrapper = document.getElementById('grid-board-wrapper');

  if (boardWrapper) {
    boardWrapper.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    boardWrapper.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        if (dx > 0) move('RIGHT');
        else move('LEFT');
      } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 30) {
        if (dy > 0) move('DOWN');
        else move('UP');
      }
    }, { passive: true });
  }

  if (newGameBtn) newGameBtn.addEventListener('click', initGame);
  if (modalRestartBtn) {
    modalRestartBtn.addEventListener('click', () => {
      if (bsModal) bsModal.hide();
      cleanupBackdrops();
      initGame();
    });
  }

  // Re-sync positions on window resize
  window.addEventListener('resize', () => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const tile = grid[r][c];
        if (tile && tile.element) {
          moveTileElement(tile, r, c);
        }
      }
    }
  });

  // Initial Start
  initGame();
});
