/**
 * Matiks - WebRTC Audio & Video Calling Engine & Group Meeting Rooms
 * Works globally across all pages & game views!
 */
(function() {
  // Global WebRTC State
  const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let localStream = null;
  let peerConnections = {}; // socketId -> RTCPeerConnection (mesh for group meetings & 1-on-1)
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
      transition: all 0.3s ease;
    `;

    overlay.innerHTML = `
      <!-- Call Header -->
      <div id="call-modal-header" style="background: #1e293b; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid rgba(255,255,255,0.1); cursor: move; user-select: none;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📹</span>
          <span id="call-status-title" style="font-family: var(--font-heading, 'Outfit', sans-serif); font-weight: 800; font-size: 14px; color: #ffffff;">Video Call</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="call-toggle-min-btn" onclick="toggleCallMinimize()" style="background: transparent; border: none; color: #94a3b8; font-weight: 800; font-size: 14px; cursor: pointer;">↗️</button>
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
        <button id="call-end-btn" onclick="endCall()" title="End Call" style="width: 50px; height: 50px; border-radius: 50%; background: #ef4444; border: 2px solid #f87171; color: #ffffff; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 14px rgba(239,68,68,0.5); transition: all 0.2s ease;">
          🔴
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
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
      alert("Camera or Microphone access failed. Please check permissions!");
      return null;
    }
  }

  // Create PeerConnection helper
  function createPeerConnection(targetSocketId) {
    if (peerConnections[targetSocketId]) return peerConnections[targetSocketId];

    const pc = new RTCPeerConnection(iceServers);
    peerConnections[targetSocketId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && window.matiksSocket) {
        window.matiksSocket.emit('ice_candidate', {
          candidate: event.candidate,
          targetSocketId
        });
      }
    };

    pc.ontrack = (event) => {
      renderRemoteVideoStream(targetSocketId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        removeRemoteVideo(targetSocketId);
      }
    };

    return pc;
  }

  function renderRemoteVideoStream(socketId, stream) {
    const wrapper = document.getElementById('remote-videos-wrapper');
    if (!wrapper) return;

    let vidContainer = document.getElementById(`remote-vid-box-${socketId}`);
    if (!vidContainer) {
      vidContainer = document.createElement('div');
      vidContainer.id = `remote-vid-box-${socketId}`;
      vidContainer.style.cssText = 'flex: 1; min-width: 140px; height: 220px; background: #0f172a; border-radius: 14px; overflow: hidden; border: 1.5px solid rgba(255,255,255,0.15); position: relative;';
      
      const vidEl = document.createElement('video');
      vidEl.id = `remote-vid-${socketId}`;
      vidEl.autoplay = true;
      vidEl.playsinline = true;
      vidEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

      vidContainer.appendChild(vidEl);
      wrapper.appendChild(vidContainer);
    }

    const videoEl = document.getElementById(`remote-vid-${socketId}`);
    if (videoEl) videoEl.srcObject = stream;
  }

  function removeRemoteVideo(socketId) {
    const vidContainer = document.getElementById(`remote-vid-box-${socketId}`);
    if (vidContainer) vidContainer.remove();
    if (peerConnections[socketId]) {
      peerConnections[socketId].close();
      delete peerConnections[socketId];
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

    // Fetch user profile to send caller info
    fetch('/api/user/profile')
      .then(res => res.json())
      .then(async (currentUser) => {
        const socket = window.matiksSocket;
        if (!socket) return;

        const pc = createPeerConnection('direct_peer');
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
      });
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
        const socket = window.matiksSocket;
        if (socket) {
          socket.emit('join_video_room', {
            roomId,
            userId: user._id,
            userName: user.name,
            userUsername: user.username
          });
        }
      });
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
  };

  window.endCall = function() {
    const socket = window.matiksSocket;
    if (socket) {
      if (currentCallRoomId) {
        socket.emit('leave_video_room');
      } else if (activeTargetSocketId || activeTargetUserId) {
        socket.emit('end_call', { targetSocketId: activeTargetSocketId, targetUserId: activeTargetUserId });
      }
    }

    // Stop local tracks
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    // Close all PeerConnections
    Object.keys(peerConnections).forEach(id => {
      peerConnections[id].close();
      delete peerConnections[id];
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
  document.addEventListener('DOMContentLoaded', () => {
    injectCallModalHTML();

    const interval = setInterval(() => {
      const socket = window.matiksSocket;
      if (socket) {
        clearInterval(interval);

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

            const pc = createPeerConnection(data.socketId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('answer_call', {
              targetSocketId: data.socketId,
              callerId: data.callerId,
              answer
            });
          } else {
            socket.emit('end_call', { targetSocketId: data.socketId });
          }
        });

        socket.on('call_accepted', async (data) => {
          activeTargetSocketId = data.responderSocketId;
          const title = document.getElementById('call-status-title');
          if (title) title.textContent = 'Connected ✓';

          const pc = peerConnections['direct_peer'];
          if (pc && data.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        });

        socket.on('ice_candidate', async (data) => {
          const pc = peerConnections[data.fromSocketId] || peerConnections['direct_peer'];
          if (pc && data.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.warn("ICE candidate error:", e);
            }
          }
        });

        socket.on('call_ended', () => {
          alert("Call ended by friend.");
          endCall();
        });

        // Group Room WebRTC Signaling
        socket.on('user_joined_room', async (data) => {
          const pc = createPeerConnection(data.socketId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit('call_user', {
            targetSocketId: data.socketId,
            offer
          });
        });

        socket.on('user_left_room', (data) => {
          removeRemoteVideo(data.socketId);
        });
      }
    }, 500);
  });
})();
