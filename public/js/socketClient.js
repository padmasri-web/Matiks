/**
 * Matiks - Real-Time Socket.IO Client for Friend Requests & Notifications
 */
(function() {
  if (typeof io === 'undefined') return;

  const socket = io();
  window.matiksSocket = socket;

  let unreadNotificationsCount = 0;

  // Request HTML5 Desktop Browser Notification permission on first click
  if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    const askPermission = () => {
      Notification.requestPermission();
      document.removeEventListener('click', askPermission);
    };
    document.addEventListener('click', askPermission);
  }

  // Audio Chime Synthesizer / Sound Player for Incoming Notifications
  function playNotificationSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio chime skipped:", e.message);
    }
  }

  // Initialize and join user's private socket room & load pending notifications
  fetch('/api/user/profile')
    .then(res => res.json())
    .then(user => {
      if (user && user._id) {
        socket.emit('join_user_room', user._id);
        loadPendingNotifications();
      }
    })
    .catch(err => console.warn("Socket connection user join skipped:", err.message));

  function loadPendingNotifications() {
    fetch('/api/notifications/pending')
      .then(res => res.json())
      .then(notifications => {
        if (Array.isArray(notifications) && notifications.length > 0) {
          notifications.forEach(n => {
            addNavbarNotification(
              'Friend Request',
              `@${n.requesterUsername} sent you a request`,
              n.requesterId,
              false
            );
          });
        }
      })
      .catch(err => console.warn("Could not load pending notifications:", err.message));
  }

  // Toast Notification Container Setup
  function createToastContainer() {
    let container = document.getElementById('matiks-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'matiks-toast-container';
      container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(title, message, icon = '👋', bg = '#1e293b') {
    const container = createToastContainer();
    const toast = document.createElement('div');
    toast.style.cssText = `
      background: ${bg};
      color: #ffffff;
      border: 2px solid #334155;
      border-radius: 16px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      font-family: var(--font-main, 'Inter', sans-serif);
      font-size: 14px;
      min-width: 280px;
      pointer-events: auto;
      transform: translateY(20px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    toast.innerHTML = `
      <div style="font-size: 22px;">${icon}</div>
      <div style="flex: 1;">
        <div style="font-weight: 800; font-family: var(--font-heading, 'Outfit', sans-serif); font-size: 15px;">${title}</div>
        <div style="color: #94a3b8; font-size: 13px; margin-top: 2px;">${message}</div>
      </div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // Trigger HTML5 Native Desktop Push Notification
  function sendDesktopNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/assets/svg/logo.svg'
        });
      } catch (e) {
        console.warn("Desktop notification blocked:", e.message);
      }
    }
  }

  // Add Item to Navbar Notification Dropdown
  function addNavbarNotification(title, subtitle, requesterId = null, incrementCount = true) {
    const badge = document.getElementById('notification-badge');
    const notifList = document.getElementById('notification-list');
    const emptyState = document.getElementById('notif-empty-state');
    const countText = document.getElementById('notif-count-text');

    if (incrementCount) {
      unreadNotificationsCount++;
    } else {
      unreadNotificationsCount = (notifList ? notifList.children.length : 0) + 1;
    }

    if (badge) {
      badge.textContent = unreadNotificationsCount;
      badge.style.display = unreadNotificationsCount > 0 ? 'block' : 'none';
    }

    if (countText) {
      countText.textContent = `${unreadNotificationsCount} new`;
    }

    if (emptyState) {
      emptyState.style.display = 'none';
    }

    if (notifList) {
      // Prevent duplicates
      if (requesterId && notifList.querySelector(`[data-notif-user="${requesterId}"]`)) {
        return;
      }

      const item = document.createElement('div');
      item.dataset.notifUser = requesterId || '';
      item.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;';
      
      const content = `
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #ffffff;">${title}</div>
          <div style="font-size: 12px; color: #94a3b8;">${subtitle}</div>
        </div>
      `;

      if (requesterId) {
        item.innerHTML = content + `
          <button onclick="acceptNotifFriend('${requesterId}', this)" style="background: #10b981; border: none; color: #ffffff; font-weight: 800; font-size: 12px; padding: 5px 12px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">
            Accept
          </button>
        `;
      } else {
        item.innerHTML = content;
      }

      notifList.prepend(item);
    }
  }

  window.acceptNotifFriend = async function(requesterId, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId })
      });

      if (res.ok) {
        btn.textContent = 'Friends ✓';
        btn.style.background = '#3b82f6';
        
        // Emit socket notification back to requester
        if (socket) {
          socket.emit('accept_friend_request', { requesterId });
        }

        // Update list button if on find friends page
        const findBtn = document.querySelector(`button[onclick*="${requesterId}"]`);
        if (findBtn) {
          findBtn.className = 'find-action-btn friends';
          findBtn.textContent = 'Friends ✓';
        }

        // Decrement badge count
        if (unreadNotificationsCount > 0) unreadNotificationsCount--;
        const badge = document.getElementById('notification-badge');
        const countText = document.getElementById('notif-count-text');
        if (badge) {
          badge.textContent = unreadNotificationsCount;
          badge.style.display = unreadNotificationsCount > 0 ? 'block' : 'none';
        }
        if (countText) {
          countText.textContent = `${unreadNotificationsCount} new`;
        }
      } else {
        btn.textContent = 'Accept';
        btn.disabled = false;
      }
    } catch (err) {
      console.error("Accept notification friend error:", err);
      btn.textContent = 'Accept';
      btn.disabled = false;
    }
  };

  // Real-time Socket Event Listeners
  socket.on('friend_request_received', (data) => {
    playNotificationSound();
    showToast('New Friend Request', `@${data.requesterUsername} sent you a friend request!`, '👋', '#1e1b4b');
    sendDesktopNotification('Matiks - Friend Request', `@${data.requesterUsername} sent you a friend request!`);
    addNavbarNotification('Friend Request', `@${data.requesterUsername} sent a request`, data.requesterId, true);

    // Update find friends list button if on page
    const userRowBtn = document.querySelector(`button[onclick*="${data.requesterId}"]`);
    if (userRowBtn) {
      userRowBtn.className = 'find-action-btn';
      userRowBtn.textContent = 'Accept';
      userRowBtn.onclick = function() {
        if (typeof acceptFriend === 'function') {
          acceptFriend(data.requesterId, this);
        }
      };
    }
  });

  socket.on('friend_request_accepted', (data) => {
    playNotificationSound();
    showToast('Friend Request Accepted', `@${data.recipientUsername} accepted your friend request!`, '🎉', '#064e3b');
    sendDesktopNotification('Matiks - Request Accepted', `@${data.recipientUsername} accepted your friend request!`);
    addNavbarNotification('Request Accepted', `@${data.recipientUsername} is now your friend!`, null, true);

    const userRowBtn = document.querySelector(`button[onclick*="${data.recipientId}"]`);
    if (userRowBtn) {
      userRowBtn.className = 'find-action-btn friends';
      userRowBtn.textContent = 'Friends ✓';
    }
  });

  socket.on('friend_request_withdrawn', (data) => {
    const userRowBtn = document.querySelector(`button[onclick*="${data.requesterId}"]`);
    if (userRowBtn) {
      userRowBtn.className = 'find-action-btn';
      userRowBtn.textContent = '+ Add';
      userRowBtn.onclick = function() {
        if (typeof toggleFriend === 'function') {
          toggleFriend(data.requesterId, this);
        }
      };
    }

    // Remove item from navbar notification dropdown
    const notifItem = document.querySelector(`[data-notif-user="${data.requesterId}"]`);
    if (notifItem) {
      notifItem.remove();
      if (unreadNotificationsCount > 0) unreadNotificationsCount--;
      const badge = document.getElementById('notification-badge');
      if (badge) {
        badge.textContent = unreadNotificationsCount;
        badge.style.display = unreadNotificationsCount > 0 ? 'block' : 'none';
      }
    }
  });

  socket.on('new_post_published', (post) => {
    // If not currently on /feed, show a subtle toast update
    if (!window.location.pathname.includes('/feed')) {
      showToast('New Community Post', `@${post.authorUsername || 'Player'} shared a post: "${post.content.substring(0, 30)}..."`, '📢', '#0f172a');
    }
  });
})();
