document.addEventListener('DOMContentLoaded', () => {
  // Select DOM Elements
  const coinsCount = document.getElementById('coins-count');
  const dropsCount = document.getElementById('drops-count');
  const xpCount = document.getElementById('xp-count');
  const friendsList = document.getElementById('active-friends-list');
  const userAvatarInitial = document.getElementById('user-avatar-initial');
  const userProfileName = document.getElementById('user-profile-name');
  const userProfileUsername = document.getElementById('user-profile-username');

  const timerText = document.getElementById('timer-text');
  const dailyProgressFill = document.getElementById('daily-challenges-progress-fill');
  const dailyProgressLabel = document.getElementById('daily-challenges-progress-label');

  const categoryCards = document.querySelectorAll('.category-card');
  const questsRenderList = document.getElementById('quests-render-list');
  const claimRewardsBtn = document.getElementById('claim-rewards-btn');

  // Game Mode Card Badges
  const modeSprintBadge = document.querySelector('#mode-sprint-duels .mode-badge');
  const modeFastBadge = document.querySelector('#mode-fast-first .mode-badge');

  // Shared state
  let currentCoins = 500;
  let currentDrops = 0;
  let currentXp = 0;
  let challengesCompleted = 0;
  const totalChallenges = 6;

  // Initialize countdown timer (e.g., 38 minutes and 42 seconds)
  let timerSeconds = 38 * 60 + 42;

  function startCountdown() {
    if (!timerText) return;
    const interval = setInterval(() => {
      if (timerSeconds <= 0) {
        clearInterval(interval);
        if (timerText) timerText.textContent = "00:00";
        return;
      }
      timerSeconds--;
      const minutes = Math.floor(timerSeconds / 60);
      const seconds = timerSeconds % 60;
      if (timerText) timerText.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }

  // Fetch data from backend
  async function loadDashboardData() {
    try {
      // 1. Fetch User profile
      const userRes = await fetch('/api/user/profile');
      const user = await userRes.json();

      // Update local values
      currentCoins = user.coins;
      currentDrops = user.drops;
      currentXp = user.xp;

      // Update Header Stats
      animateCounter(coinsCount, currentCoins);
      animateCounter(dropsCount, currentDrops);
      if (xpCount) xpCount.textContent = `${currentXp} XP`;

      // Update profile preview
      if (userProfileName) userProfileName.textContent = user.name;
      if (userProfileUsername) userProfileUsername.textContent = `@${user.username}`;
      if (userAvatarInitial && user.name) userAvatarInitial.textContent = user.name.charAt(0);

      // Render friends list
      renderFriends(user.onlineFriends);

      // Render quests list
      renderQuests(user.quests);

      // 2. Fetch Challenges summary
      const chalRes = await fetch('/api/challenges/summary');
      const data = await chalRes.json();

      // Update Daily progress
      challengesCompleted = data.dailyProgress.completed;
      updateDailyProgressHTML();

      // Render category metrics
      data.categories.forEach(cat => {
        const element = document.getElementById(`count-${cat.name.toLowerCase()}`);
        if (element) {
          element.textContent = cat.statsCount;
        }
      });

      // Populate Today's Daily Challenges parameters
      if (data.dailyChallenge) {
        const dc = data.dailyChallenge;
        const loText = document.getElementById('target-lightsout-text');
        const loXp = document.getElementById('target-lightsout-xp');
        if (loText && dc.lightsOut) loText.textContent = `${dc.lightsOut.gridDifficulty} · Max ${dc.lightsOut.targetMoves} moves`;
        if (loXp && dc.lightsOut) loXp.textContent = `+${dc.lightsOut.rewardXP} XP`;

        const mmText = document.getElementById('target-memory-text');
        const mmXp = document.getElementById('target-memory-xp');
        if (mmText && dc.memoryMatch) mmText.textContent = `${dc.memoryMatch.pairCount} Pairs · ${dc.memoryMatch.timeLimit}s`;
        if (mmXp && dc.memoryMatch) mmXp.textContent = `+${dc.memoryMatch.rewardXP} XP`;

        const sdkText = document.getElementById('target-sudoku-text');
        const sdkXp = document.getElementById('target-sudoku-xp');
        if (sdkText && dc.sudoku) sdkText.textContent = `${dc.sudoku.difficulty} · ${dc.sudoku.initialClues} Clues`;
        if (sdkXp && dc.sudoku) sdkXp.textContent = `+${dc.sudoku.rewardXP} XP`;
      }

    } catch (error) {
      console.warn("Failed to load dashboard data from backend APIs. Running local mock engine.", error);
      // Fallback local engine runs automatically if fetch fails
      runLocalMockEngine();
    }
  }

  function runLocalMockEngine() {
    animateCounter(coinsCount, currentCoins);
    animateCounter(dropsCount, currentDrops);
    if (xpCount) xpCount.textContent = `${currentXp} XP`;

    // Setup initial mock friends list
    const mockFriends = [
      { name: 'YOU', avatar: 'J', status: 'online', color: '#4564C6' },
      { name: 'SIDDNT', avatar: '', status: 'online', color: '#F42F76' },
      { name: 'CHANAKY...', avatar: '', status: 'online', color: '#50D1E0' },
      { name: 'DIVYASAI...', avatar: '', status: 'online', color: '#F58DB4' },
      { name: 'KRISHHH7...', avatar: '', status: 'idle', color: '#B8F3FA' },
      { name: 'ADARSH9...', avatar: '', status: 'idle', color: '#52516E' },
      { name: 'PSEUDOC...', avatar: 'P', status: 'online', color: '#50D1E0' }
    ];
    renderFriends(mockFriends);

    // Setup initial mock quests list
    const mockQuests = [
      { title: "Complete today's Puzzle - Sudoku Challenge", category: "Puzzle", currentProgress: 0, targetProgress: 1, completed: false },
      { title: "Play 1 Math - Sprint Duel", category: "Math", currentProgress: 1, targetProgress: 1, completed: true },
      { title: "Play 1 Memory - Mind Snap Duel", category: "Memory", currentProgress: 1, targetProgress: 1, completed: true }
    ];
    renderQuests(mockQuests);
    updateDailyProgressHTML();
  }

  // Render online friends list
  function renderFriends(friends) {
    if (!friendsList || !friends) return;
    friendsList.innerHTML = '';
    friends.forEach((friend, idx) => {
      const item = document.createElement('div');
      item.className = 'friend-item';
      item.title = friend.name;

      const avatar = document.createElement('div');
      avatar.className = 'friend-avatar';

      if (friend.avatar) {
        // Initials or image
        if (friend.avatar.length === 1) {
          avatar.textContent = friend.avatar;
          avatar.style.backgroundColor = friend.color || 'var(--accent-royal-blue)';
        } else {
          const img = document.createElement('img');
          img.src = friend.avatar;
          img.alt = friend.name;
          avatar.appendChild(img);
        }
      } else {
        // Fallback initials
        avatar.textContent = friend.name.charAt(0);
        avatar.style.backgroundColor = friend.color || 'var(--accent-royal-blue)';
      }

      const status = document.createElement('span');
      status.className = `friend-status ${friend.status}`;

      item.appendChild(avatar);
      item.appendChild(status);
      friendsList.appendChild(item);
    });
  }

  // Render Quests list
  function renderQuests(quests) {
    if (!questsRenderList) return;
    questsRenderList.innerHTML = '';

    // Sort quests so active are first, completed last
    const sortedQuests = [...quests].sort((a, b) => a.completed - b.completed);

    sortedQuests.forEach((quest, idx) => {
      const card = document.createElement('div');
      card.className = `card quest-card ${quest.completed ? 'completed' : ''}`;

      const percent = Math.min((quest.currentProgress / quest.targetProgress) * 100, 100);

      // Quest header
      const top = document.createElement('div');
      top.className = 'quest-top';

      const title = document.createElement('span');
      title.className = 'quest-title';
      title.textContent = quest.title;

      let actionElement;
      if (quest.completed) {
        actionElement = document.createElement('div');
        actionElement.className = 'quest-check';
        actionElement.textContent = '✓';
      } else {
        actionElement = document.createElement('button');
        actionElement.className = 'quest-play-btn';
        actionElement.textContent = 'Play Now';
        actionElement.addEventListener('click', () => {
          if (quest.title && quest.title.toLowerCase().includes('sudoku')) {
            window.location.href = '/games/sudoku';
          } else {
            completeQuest(quest, card);
          }
        });
      }

      top.appendChild(title);
      top.appendChild(actionElement);

      // Progress bar
      const progressTrack = document.createElement('div');
      progressTrack.className = 'quest-progress-track';

      const progressFill = document.createElement('div');
      progressFill.className = 'quest-progress-fill';
      progressFill.style.width = '0%'; // For slide-in animation

      progressTrack.appendChild(progressFill);
      card.appendChild(top);
      card.appendChild(progressTrack);

      questsRenderList.appendChild(card);

      // Slide in progress bar
      setTimeout(() => {
        progressFill.style.width = `${percent}%`;
      }, 100);
    });
  }

  // Action to complete a quest
  async function completeQuest(quest, cardElement) {
    // 1. Interactive animation
    const button = cardElement.querySelector('.quest-play-btn');
    if (button) {
      button.textContent = 'Completing...';
      button.disabled = true;
    }

    setTimeout(async () => {
      // Reward calculation
      const coinReward = 150;
      const xpReward = 200;

      currentCoins += coinReward;
      currentXp += xpReward;

      // Update UI counts
      animateCounter(coinsCount, currentCoins);
      if (xpCount) xpCount.textContent = `${currentXp} XP`;

      // Update challenges progress
      if (challengesCompleted < totalChallenges) {
        challengesCompleted++;
        updateDailyProgressHTML();
      }

      // Play click rewards effect (small scaling)
      if (coinsCount) coinsCount.parentElement.style.transform = 'scale(1.1)';
      if (xpCount) xpCount.parentElement.style.transform = 'scale(1.1)';
      setTimeout(() => {
        if (coinsCount) coinsCount.parentElement.style.transform = 'none';
        if (xpCount) xpCount.parentElement.style.transform = 'none';
      }, 200);

      // Try updating server backend
      try {
        await fetch('/api/user/stats', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            coins: currentCoins,
            xp: currentXp
          })
        });
      } catch (err) {
        console.warn("Could not save quest update to server database:", err.message);
      }

      // Convert quest to completed state
      quest.completed = true;
      quest.currentProgress = quest.targetProgress;

      // Re-render
      loadDashboardData();
    }, 800);
  }

  // Update Daily progress HTML bar
  function updateDailyProgressHTML() {
    const percent = Math.min((challengesCompleted / totalChallenges) * 100, 100);
    if (dailyProgressFill) dailyProgressFill.style.width = `${percent}%`;
    if (dailyProgressLabel) dailyProgressLabel.textContent = `${challengesCompleted}/${totalChallenges}`;
  }

  // Category card tab triggers
  categoryCards.forEach(card => {
    card.addEventListener('click', () => {
      categoryCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      const selectedCategory = card.getAttribute('data-category');

      // Dynamic shift of Game Modes to selected category
      if (modeSprintBadge) modeSprintBadge.textContent = selectedCategory;
      if (modeFastBadge) modeFastBadge.textContent = selectedCategory;

      // Swap accent badge colors based on category
      const colorMap = {
        Math: '#FFD23F',
        Memory: 'var(--accent-royal-blue)',
        Puzzle: 'var(--accent-aqua)',
        Logic: 'var(--accent-hot-pink)'
      };

      const targetColor = colorMap[selectedCategory] || 'var(--accent-royal-blue)';
      if (modeSprintBadge) modeSprintBadge.style.backgroundColor = targetColor;
      if (modeFastBadge) modeFastBadge.style.backgroundColor = targetColor;

      // Small category pop animation
      card.style.transform = 'scale(1.05)';
      setTimeout(() => {
        card.style.transform = 'none';
      }, 150);
    });
  });

  // Rewards button action
  if (claimRewardsBtn) {
    claimRewardsBtn.addEventListener('click', () => {
      if (challengesCompleted >= totalChallenges) {
        alert("Congratulations! You've unlocked today's Daily Trophy! +500 Coins!");
        currentCoins += 500;
        animateCounter(coinsCount, currentCoins);
        challengesCompleted = 0;
        updateDailyProgressHTML();
      } else {
        alert(`Complete ${totalChallenges - challengesCompleted} more daily challenges to unlock the chest!`);
      }
    });
  }

  // Counter animation utility
  function animateCounter(element, target) {
    const current = parseInt(element.textContent) || 0;
    if (current === target) return;

    const range = target - current;
    const duration = 1000;
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      element.textContent = Math.floor(current + progress * range);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        element.textContent = target;
      }
    }
    window.requestAnimationFrame(step);
  }

  // Initialize
  startCountdown();
  loadDashboardData();
});
