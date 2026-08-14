document.addEventListener('DOMContentLoaded', () => {
  const gameBoard = document.getElementById('game-board');
  const resetBtn = document.getElementById('reset-btn');
  const winModalEl = document.getElementById('winModal');
  const gameOverModalEl = document.getElementById('gameOverModal');
  const timerTextEl = document.getElementById('game-timer') || document.getElementById('timer-text');
  const timerToggleEl = document.getElementById('timer-toggle');
  const musicToggleBtn = document.getElementById('music-toggle-btn') || document.getElementById('music-toggle');
  
  const GRID_SIZE = 5;
  const GAME_DURATION = 120; // 2 minutes in seconds

  let isGenerating = false;
  let isGameOver = false;
  let timerInterval = null;
  let timeLeft = GAME_DURATION;
  let isTimerEnabled = timerToggleEl ? timerToggleEl.checked : true;

  // Audio Controllers (Background, Win, Loss)
  let isMusicEnabled = true;
  let bgMusic = new Audio('/assets/mp3/music.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.5;

  function playMusic() {
    if (!isMusicEnabled) return;
    bgMusic.play().then(() => {
      if (musicToggleBtn) musicToggleBtn.classList.remove('muted');
    }).catch(err => {
      console.warn("Autoplay restriction waiting for user interaction:", err);
    });
  }

  function pauseMusic() {
    bgMusic.pause();
    if (musicToggleBtn) musicToggleBtn.classList.add('muted');
  }

  function playWinSound() {
    if (!isMusicEnabled) return;
    pauseMusic();
    const winSound = new Audio('/assets/mp3/win.mp3');
    winSound.volume = 0.7;
    winSound.play().catch(err => console.warn("Win sound audio play error:", err));
  }

  function playLossSound() {
    if (!isMusicEnabled) return;
    pauseMusic();
    const lossSound = new Audio('/assets/mp3/loss.mp3');
    lossSound.volume = 0.7;
    lossSound.play().catch(err => console.warn("Loss sound audio play error:", err));
  }

  // Attempt autoplay immediately on load
  playMusic();

  // Handle browser autoplay policy (play on first click/interaction if blocked)
  const enableAudioOnInteraction = () => {
    if (isMusicEnabled && bgMusic.paused && !isGameOver) {
      playMusic();
    }
    document.removeEventListener('click', enableAudioOnInteraction);
    document.removeEventListener('keydown', enableAudioOnInteraction);
  };
  document.addEventListener('click', enableAudioOnInteraction);
  document.addEventListener('keydown', enableAudioOnInteraction);

  // Music Icon Button Click Listener
  if (musicToggleBtn) {
    musicToggleBtn.addEventListener('click', () => {
      isMusicEnabled = !isMusicEnabled;
      if (isMusicEnabled) {
        playMusic();
      } else {
        pauseMusic();
      }
    });
  }

  // Timer Toggle listener
  if (timerToggleEl) {
    timerToggleEl.addEventListener('change', () => {
      isTimerEnabled = timerToggleEl.checked;
      if (isTimerEnabled) {
        startTimer();
      } else {
        stopTimer();
        if (timerTextEl) timerTextEl.textContent = 'OFF';
      }
    });
  }

  // Timer functions
  function startTimer() {
    stopTimer();
    if (!isTimerEnabled) {
      if (timerTextEl) timerTextEl.textContent = 'OFF';
      return;
    }

    timeLeft = GAME_DURATION;
    isGameOver = false;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();

      if (timeLeft <= 0) {
        handleGameOver();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    if (!timerTextEl) return;
    if (!isTimerEnabled) {
      timerTextEl.textContent = 'OFF';
      return;
    }
    const minutes = Math.floor(Math.max(0, timeLeft) / 60);
    const seconds = Math.max(0, timeLeft) % 60;
    const formattedMin = String(minutes).padStart(2, '0');
    const formattedSec = String(seconds).padStart(2, '0');
    timerTextEl.textContent = `${formattedMin}:${formattedSec}`;
  }

  async function handleGameOver() {
    stopTimer();
    isGameOver = true;
    playLossSound();
    if (gameOverModalEl && typeof bootstrap !== 'undefined') {
      const modal = new bootstrap.Modal(gameOverModalEl);
      modal.show();
    }

    try {
      await fetch('/api/user/gamelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'Puzzle',
          mode: 'Lights Out',
          playerScore: 0,
          opponentName: 'AI Grid Master',
          opponentScore: 100
        })
      });
    } catch (err) {
      console.warn("Failed to log Lights Out loss game log:", err.message);
    }
  }

  // Grid Generation
  function generateGrid() {
    if (!gameBoard) return;
    gameBoard.innerHTML = '';
    
    // Grid container layout styling
    gameBoard.style.display = 'grid';
    gameBoard.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    gameBoard.style.gap = '10px';
    gameBoard.style.maxWidth = '420px';
    gameBoard.style.margin = '0 auto';

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-dark shadow-sm';
        btn.dataset.row = row;
        btn.dataset.col = col;

        btn.addEventListener('click', () => {
          if (isGenerating || isGameOver) return;
          toggleAndNeighbors(row, col);
          checkWin();
        });

        gameBoard.appendChild(btn);
      }
    }
  }

  // Boundary check & toggle individual light state
  function toggleTile(row, col) {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
      return; // Boundary check
    }
    const tile = gameBoard.querySelector(`button[data-row="${row}"][data-col="${col}"]`);
    if (!tile) return;

    if (tile.classList.contains('btn-warning')) {
      tile.classList.remove('btn-warning');
      tile.classList.add('btn-dark');
    } else {
      tile.classList.remove('btn-dark');
      tile.classList.add('btn-warning');
    }
  }

  // Toggle clicked tile and its immediate orthogonal neighbors (up, down, left, right)
  function toggleAndNeighbors(row, col) {
    toggleTile(row, col);
    toggleTile(row - 1, col); // up
    toggleTile(row + 1, col); // down
    toggleTile(row, col - 1); // left
    toggleTile(row, col + 1); // right
  }

  // Fresh Game Generation & Timer Reset
  function startFreshGame() {
    if (!gameBoard) return;
    isGenerating = true;

    // Set all 25 lights to OFF (btn-dark)
    const allButtons = gameBoard.querySelectorAll('button');
    allButtons.forEach(btn => {
      btn.classList.remove('btn-warning');
      btn.classList.add('btn-dark');
    });

    // Randomly select and "click" between 15 to 25 tiles programmatically
    const randomClicks = Math.floor(Math.random() * 11) + 15; // 15 to 25 inclusive
    for (let i = 0; i < randomClicks; i++) {
      const randRow = Math.floor(Math.random() * GRID_SIZE);
      const randCol = Math.floor(Math.random() * GRID_SIZE);
      toggleAndNeighbors(randRow, randCol);
    }

    // Ensure game does not start in an already won state
    const activeLights = gameBoard.querySelectorAll('.btn-warning');
    if (activeLights.length === 0) {
      toggleAndNeighbors(2, 2);
    }

    isGenerating = false;

    // Resume background music if enabled
    if (isMusicEnabled) {
      playMusic();
    }

    // Reset and start timer (if enabled)
    startTimer();
  }

  // Win Condition check after every player click
  async function checkWin() {
    if (isGameOver) return;
    const activeLights = gameBoard.querySelectorAll('.btn-warning');
    if (activeLights.length === 0) {
      stopTimer();
      isGameOver = true;
      playWinSound();
      if (winModalEl && typeof bootstrap !== 'undefined') {
        const modal = new bootstrap.Modal(winModalEl);
        modal.show();
      }

      try {
        await fetch('/api/user/gamelog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'Puzzle',
            mode: 'Lights Out',
            playerScore: 100,
            opponentName: 'AI Grid Master',
            opponentScore: 0
          })
        });
      } catch (err) {
        console.warn("Failed to log Lights Out win game log:", err.message);
      }
    }
  }

  // Initialize Board and Start Game
  generateGrid();
  startFreshGame();

  // Reset button event listener
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      bgMusic.currentTime = 0;
      startFreshGame();
    });
  }

  // Modal play again / try again button handlers
  const modalResetBtn = document.getElementById('modal-reset-btn');
  if (modalResetBtn) {
    modalResetBtn.addEventListener('click', () => {
      bgMusic.currentTime = 0;
      startFreshGame();
    });
  }

  const gameOverResetBtn = document.getElementById('modal-gameover-reset-btn') || document.getElementById('game-over-reset-btn');
  if (gameOverResetBtn) {
    gameOverResetBtn.addEventListener('click', () => {
      bgMusic.currentTime = 0;
      startFreshGame();
    });
  }
});
