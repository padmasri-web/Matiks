/**
 * Matiks - WebRTC Audio & Video Calling Engine & Group Meeting Rooms
 * Works globally across all pages & game views!
 */
(function() {
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  };
  let localStream = null;
  let peerConnections = {}; // targetKey -> RTCPeerConnection
  let activeTargetSocketId = null;
  let activeTargetUserId = null;
  let currentCallRoomId = null;
  let isAudioMuted = false;
  let isVideoOff = false;
  let isMinimized = false;

  // Render Global Floating WebRTC Call Modal Overlay
  function injectCallModalHTML() {
    if (document.getElementById('matiks-call-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'matiks-call-overlay';
    overlay.style.cssText = `
      display: none;
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 380px;
      background: #0f172a;
      border: 2px solid #38bdf8;
      border-radius: 24px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
      z-index: 999999;
      overflow: hidden;
      font-family: var(--font-main, 'Inter', sans-serif);
      transition: width 0.25s ease, opacity 0.25s ease;
      touch-action: none;
    `;

    overlay.innerHTML = `
      <style>
        #matiks-call-overlay.is-dragging {
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.5) !important;
          opacity: 0.96;
          user-select: none;
        }
        #call-modal-header {
          cursor: grab;
          user-select: none;
          touch-action: none;
        }
        #call-modal-header:active {
          cursor: grabbing;
        }
        .drag-indicator-grip {
          opacity: 0.65;
          font-size: 14px;
          cursor: grab;
          line-height: 1;
          letter-spacing: -1px;
          user-select: none;
        }
        #call-modal-header:hover .drag-indicator-grip {
          opacity: 1;
          color: #38bdf8;
        }
        @media (max-width: 600px) {
          #matiks-call-overlay:not([data-dragged="true"]) {
            bottom: 12px !important;
            right: 12px !important;
            left: 12px !important;
            width: calc(100% - 24px) !important;
            max-width: 100% !important;
          }
          #video-grid-container {
            min-height: 200px !important;
            max-height: 280px !important;
          }
          #local-video-pip {
            width: 70px !important;
            height: 90px !important;
            bottom: 8px !important;
            right: 8px !important;
          }
        }
      </style>
      <!-- Call Header (Draggable Handle) -->
      <div id="call-modal-header" title="Click and drag to reposition video box" style="background: #1e293b; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
          <span class="drag-indicator-grip">⠿</span>
          <span style="font-size: 16px;">📹</span>
          <span id="call-status-title" style="font-family: var(--font-heading, 'Outfit', sans-serif); font-weight: 800; font-size: 14px; color: #ffffff;">Video Meeting</span>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button id="call-toggle-min-btn" onclick="toggleCallMinimize()" title="Minimize / Restore" style="background: transparent; border: none; color: #94a3b8; font-weight: 800; font-size: 14px; cursor: pointer; padding: 2px 4px;">↗️</button>
        </div>
      </div>

      <!-- Main Video Grid Container -->
      <div id="video-grid-container" style="position: relative; width: 100%; min-height: 240px; max-height: 380px; background: #020617; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; overflow: hidden; padding: 8px; gap: 8px;">
        <!-- Remote Video Streams Grid -->
        <div id="remote-videos-wrapper" style="width: 100%; height: 100%; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center;"></div>
        
        <!-- Local Picture-In-Picture Camera Stream -->
        <div id="local-video-pip" style="position: absolute; bottom: 12px; right: 12px; width: 90px; height: 110px; background: #1e293b; border: 2px solid #38bdf8; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 10;">
          <video id="local-video-element" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);"></video>
        </div>
      </div>

      <!-- Call Controls Toolbar -->
      <div id="call-controls-bar" style="background: #1e293b; padding: 14px; display: flex; align-items: center; justify-content: center; gap: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <button id="call-mute-btn" onclick="toggleAudioMute()" title="Mute/Unmute Microphone" style="width: 44px; height: 44px; border-radius: 50%; background: #334155; border: 1.5px solid rgba(255,255,255,0.2); color: #ffffff; font-size: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
          🎤
        </button>
        <button id="call-video-btn" onclick="toggleCameraVideo()" title="Toggle Camera Video" style="width: 44px; height: 44px; border-radius: 50%; background: #334155; border: 1.5px solid rgba(255,255,255,0.2); color: #ffffff; font-size: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
          📹
        </button>
        <button id="call-end-btn" onclick="endCall()" title="Leave Call" style="width: 50px; height: 50px; border-radius: 50%; background: #ef4444; border: 2px solid #f87171; color: #ffffff; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 14px rgba(239,68,68,0.5); transition: all 0.2s ease;">
          🔴
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    setupDraggableOverlay(overlay, document.getElementById('call-modal-header'));
  }

  // Draggable logic for video overlay modal
  function setupDraggableOverlay(overlay, handle) {
    if (!overlay || !handle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function onPointerDown(e) {
      // Ignore clicks on control buttons or input elements inside header
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
        return;
      }

      isDragging = true;
      overlay.setAttribute('data-dragged', 'true');
      overlay.classList.add('is-dragging');

      const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
      const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      const rect = overlay.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Switch to pixel top/left positioning for smooth free-dragging
      overlay.style.bottom = 'auto';
      overlay.style.right = 'auto';
      overlay.style.left = `${initialLeft}px`;
      overlay.style.top = `${initialTop}px`;
      overlay.style.transition = 'none';

      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', onPointerMove, { passive: false });
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
      window.addEventListener('touchcancel', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
      const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      // Keep overlay strictly within visible viewport bounds
      const padding = 12;
      const overlayWidth = overlay.offsetWidth;
      const overlayHeight = overlay.offsetHeight;
      const maxLeft = window.innerWidth - overlayWidth - padding;
      const maxTop = window.innerHeight - overlayHeight - padding;

      newLeft = Math.max(padding, Math.min(newLeft, Math.max(padding, maxLeft)));
      newTop = Math.max(padding, Math.min(newTop, Math.max(padding, maxTop)));

      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      overlay.classList.remove('is-dragging');
      overlay.style.transition = 'width 0.25s ease, opacity 0.25s ease';
      document.body.style.userSelect = '';

      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('touchcancel', onPointerUp);
    }

    handle.addEventListener('mousedown', onPointerDown);
    handle.addEventListener('touchstart', onPointerDown, { passive: true });

    // Boundary check when window is resized
    window.addEventListener('resize', () => {
      if (overlay.style.display !== 'none' && overlay.getAttribute('data-dragged') === 'true') {
        const rect = overlay.getBoundingClientRect();
        const padding = 12;
        const maxLeft = window.innerWidth - rect.width - padding;
        const maxTop = window.innerHeight - rect.height - padding;

        if (rect.left > maxLeft) {
          overlay.style.left = `${Math.max(padding, maxLeft)}px`;
        }
        if (rect.top > maxTop) {
          overlay.style.top = `${Math.max(padding, maxTop)}px`;
        }
      }
    });
  }

  // Media Stream Initialization
  async function initLocalStream(video = true, audio = true) {
    if (localStream) return localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
      const localVidEl = document.getElementById('local-video-element');
      if (localVidEl) {
        localVidEl.srcObject = localStream;
      }
      return localStream;
    } catch (err) {
      console.warn("Could not access camera/mic:", err.message);
      if (video) {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          return localStream;
        } catch (audioErr) {
          console.warn("Audio fallback failed:", audioErr.message);
        }
      }
      alert("Camera or Microphone access failed. Please check browser permissions!");
      return null;
    }
  }

  function attachLocalTracks(pc) {
    if (!pc || !localStream) return;
    const existingTracks = pc.getSenders().map(s => s.track).filter(Boolean);
    localStream.getTracks().forEach(track => {
      if (!existingTracks.includes(track)) {
        pc.addTrack(track, localStream);
      }
    });
  }

  // Create PeerConnection helper
  function createPeerConnection(targetKey, targetSocketId = null, targetUserId = null) {
    if (peerConnections[targetKey]) {
      attachLocalTracks(peerConnections[targetKey]);
      return peerConnections[targetKey];
    }

    const pc = new RTCPeerConnection(iceServers);
    peerConnections[targetKey] = pc;

    attachLocalTracks(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && (window.matiksSocket || (typeof io !== 'undefined'))) {
        const s = window.matiksSocket || io();
        s.emit('ice_candidate', {
          candidate: event.candidate,
          targetSocketId: targetSocketId || (targetKey.startsWith('socket_') ? targetKey.replace('socket_', '') : null),
          targetUserId: targetUserId || (targetKey.startsWith('user_') ? targetKey.replace('user_', '') : activeTargetUserId)
        });
      }
    };

    pc.ontrack = (event) => {
      renderRemoteVideoStream(targetKey, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        removeRemoteVideo(targetKey);
      }
    };

    return pc;
  }

  function renderRemoteVideoStream(targetKey, stream) {
    const wrapper = document.getElementById('remote-videos-wrapper');
    if (!wrapper) return;

    let vidContainer = document.getElementById(`remote-vid-box-${targetKey}`);
    if (!vidContainer) {
      vidContainer = document.createElement('div');
      vidContainer.id = `remote-vid-box-${targetKey}`;
      vidContainer.style.cssText = 'flex: 1; min-width: 140px; height: 220px; background: #0f172a; border-radius: 14px; overflow: hidden; border: 1.5px solid rgba(255,255,255,0.15); position: relative;';
      
      const vidEl = document.createElement('video');
      vidEl.id = `remote-vid-${targetKey}`;
      vidEl.autoplay = true;
      vidEl.playsinline = true;
      vidEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

      vidContainer.appendChild(vidEl);
      wrapper.appendChild(vidContainer);
    }

    const videoEl = document.getElementById(`remote-vid-${targetKey}`);
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(e => console.warn("Remote video play error:", e));
    }
  }

  function removeRemoteVideo(targetKey) {
    const vidContainer = document.getElementById(`remote-vid-box-${targetKey}`);
    if (vidContainer) vidContainer.remove();
    if (peerConnections[targetKey]) {
      try { peerConnections[targetKey].close(); } catch(e) {}
      delete peerConnections[targetKey];
    }
  }

  // Public Methods: 1-on-1 Call Direct Launch
  window.startFriendCall = async function(targetUserId, targetName, targetUsername, callType = 'video') {
    injectCallModalHTML();
    const overlay = document.getElementById('matiks-call-overlay');
    const title = document.getElementById('call-status-title');

    activeTargetUserId = targetUserId;
    if (title) title.textContent = `Calling @${targetUsername}...`;
    if (overlay) overlay.style.display = 'block';

    const stream = await initLocalStream(callType === 'video', true);
    if (!stream) return;

    fetch('/api/user/profile')
      .then(res => res.json())
      .then(async (currentUser) => {
        const socket = window.matiksSocket || (typeof io !== 'undefined' ? io() : null);
        if (!socket) return;

        const targetKey = `user_${targetUserId}`;
        const pc = createPeerConnection(targetKey, null, targetUserId);
        attachLocalTracks(pc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call_user', {
          targetUserId,
          callerId: currentUser._id,
          callerName: currentUser.name,
          callerUsername: currentUser.username,
          callType,
          offer
        });
      })
      .catch(err => console.warn("Fetch profile error in startFriendCall:", err));
  };

  // Public Methods: Join Group Meeting Room
  window.joinMeetingRoom = async function(roomId, roomTitle = 'Group Video Meeting') {
    injectCallModalHTML();
    const overlay = document.getElementById('matiks-call-overlay');
    const title = document.getElementById('call-status-title');

    currentCallRoomId = roomId;
    if (title) title.textContent = roomTitle;
    if (overlay) overlay.style.display = 'block';

    const stream = await initLocalStream(true, true);
    if (!stream) return;

    fetch('/api/user/profile')
      .then(res => res.json())
      .then(user => {
        const socket = window.matiksSocket || (typeof io !== 'undefined' ? io() : null);
        if (socket) {
          socket.emit('join_video_room', {
            roomId,
            userId: user._id,
            userName: user.name,
            userUsername: user.username
          });
        }
      })
      .catch(err => console.warn("Fetch profile error in joinMeetingRoom:", err));
  };

  // Call Controls
  window.toggleAudioMute = function() {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
    const btn = document.getElementById('call-mute-btn');
    if (btn) {
      btn.textContent = isAudioMuted ? '🔇' : '🎤';
      btn.style.background = isAudioMuted ? '#ef4444' : '#334155';
    }
  };

  window.toggleCameraVideo = function() {
    if (!localStream) return;
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    const btn = document.getElementById('call-video-btn');
    if (btn) {
      btn.textContent = isVideoOff ? '📷' : '📹';
      btn.style.background = isVideoOff ? '#ef4444' : '#334155';
    }
  };

  window.toggleCallMinimize = function() {
    const overlay = document.getElementById('matiks-call-overlay');
    const grid = document.getElementById('video-grid-container');
    const btn = document.getElementById('call-toggle-min-btn');
    if (!overlay) return;

    isMinimized = !isMinimized;
    if (isMinimized) {
      if (grid) grid.style.display = 'none';
      overlay.style.width = '240px';
      if (btn) btn.textContent = '↙️';
    } else {
      if (grid) grid.style.display = 'flex';
      overlay.style.width = '380px';
      if (btn) btn.textContent = '↗️';
    }

    if (overlay.getAttribute('data-dragged') === 'true') {
      setTimeout(() => {
        const rect = overlay.getBoundingClientRect();
        const padding = 12;
        const maxLeft = window.innerWidth - rect.width - padding;
        const maxTop = window.innerHeight - rect.height - padding;
        if (rect.left > maxLeft) overlay.style.left = `${Math.max(padding, maxLeft)}px`;
        if (rect.top > maxTop) overlay.style.top = `${Math.max(padding, maxTop)}px`;
      }, 50);
    }
  };

  window.endCall = function() {
    const socket = window.matiksSocket || (typeof io !== 'undefined' ? io() : null);
    if (socket) {
      if (currentCallRoomId) {
        socket.emit('leave_video_room');
      } else if (activeTargetSocketId || activeTargetUserId) {
        socket.emit('end_call', { targetSocketId: activeTargetSocketId, targetUserId: activeTargetUserId });
      }
    }

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    Object.keys(peerConnections).forEach(key => {
      try { peerConnections[key].close(); } catch(e) {}
      delete peerConnections[key];
    });

    const wrapper = document.getElementById('remote-videos-wrapper');
    if (wrapper) wrapper.innerHTML = '';

    const overlay = document.getElementById('matiks-call-overlay');
    if (overlay) overlay.style.display = 'none';

    currentCallRoomId = null;
    activeTargetSocketId = null;
    activeTargetUserId = null;
  };

  // Socket.IO Listeners Setup for WebRTC Signaling
  function setupWebRTCSocketListeners(socket) {
    if (!socket || socket._webrtcListenersBound) return;
    socket._webrtcListenersBound = true;

    // Incoming 1-on-1 Call Dialog
    socket.on('incoming_call', async (data) => {
      activeTargetSocketId = data.socketId;
      activeTargetUserId = data.callerId;

      const accept = confirm(`📹 @${data.callerUsername} is video calling you! Accept call?`);
      if (accept) {
        injectCallModalHTML();
        const overlay = document.getElementById('matiks-call-overlay');
        const title = document.getElementById('call-status-title');
        if (title) title.textContent = `Call with @${data.callerUsername}`;
        if (overlay) overlay.style.display = 'block';

        const stream = await initLocalStream(data.callType === 'video', true);
        if (!stream) return;

        const targetKey = data.callerId ? `user_${data.callerId}` : `socket_${data.socketId}`;
        const pc = createPeerConnection(targetKey, data.socketId, data.callerId);
        attachLocalTracks(pc);

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer_call', {
          targetSocketId: data.socketId,
          callerId: data.callerId,
          answer
        });
      } else {
        socket.emit('end_call', { targetSocketId: data.socketId, targetUserId: data.callerId });
      }
    });

    socket.on('call_accepted', async (data) => {
      activeTargetSocketId = data.responderSocketId;
      const title = document.getElementById('call-status-title');
      if (title) title.textContent = 'Connected ✓';

      const targetKey = data.responderUserId ? `user_${data.responderUserId}` : `socket_${data.responderSocketId}`;
      const pc = peerConnections[targetKey] || peerConnections[`user_${activeTargetUserId}`] || Object.values(peerConnections)[0];
      if (pc && data.answer) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.warn("Set remote description error on call_accepted:", e);
        }
      }
    });

    socket.on('call_failed', (data) => {
      alert(data.message || 'Call failed.');
      endCall();
    });

    socket.on('ice_candidate', async (data) => {
      const targetKey = data.fromSocketId ? `socket_${data.fromSocketId}` : (data.fromUserId ? `user_${data.fromUserId}` : null);
      const pc = (targetKey ? peerConnections[targetKey] : null) || peerConnections[`user_${activeTargetUserId}`] || Object.values(peerConnections)[0];
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn("ICE candidate add error:", e);
        }
      }
    });

    socket.on('call_ended', () => {
      alert("Call ended by friend.");
      endCall();
    });

    // Group Room WebRTC Signaling
    socket.on('room_peers', async (data) => {
      if (data && data.peers && data.peers.length > 0) {
        data.peers.forEach(async (peerSocketId) => {
          const targetKey = `socket_${peerSocketId}`;
          const pc = createPeerConnection(targetKey, peerSocketId, null);
          attachLocalTracks(pc);

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit('room_offer', {
            targetSocketId: peerSocketId,
            offer
          });
        });
      }
    });

    socket.on('room_offer', async (data) => {
      if (data && data.callerSocketId && data.offer) {
        const targetKey = `socket_${data.callerSocketId}`;
        const pc = createPeerConnection(targetKey, data.callerSocketId, null);
        
        await initLocalStream(true, true);
        attachLocalTracks(pc);

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('room_answer', {
          targetSocketId: data.callerSocketId,
          answer
        });
      }
    });

    socket.on('room_answer', async (data) => {
      if (data && data.responderSocketId && data.answer) {
        const targetKey = `socket_${data.responderSocketId}`;
        const pc = peerConnections[targetKey];
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          } catch (e) {
            console.warn("Set remote description error on room_answer:", e);
          }
        }
      }
    });

    socket.on('user_joined_room', (data) => {
      console.log(`📹 User joined video room: ${data.userName || data.userUsername}`);
    });

    socket.on('user_left_room', (data) => {
      removeRemoteVideo(`socket_${data.socketId}`);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectCallModalHTML();

    if (typeof window.getMatiksSocket === 'function') {
      window.getMatiksSocket(setupWebRTCSocketListeners);
    } else {
      const interval = setInterval(() => {
        const socket = window.matiksSocket || (typeof io !== 'undefined' ? io() : null);
        if (socket) {
          clearInterval(interval);
          setupWebRTCSocketListeners(socket);
        }
      }, 300);
    }
  });
})();
