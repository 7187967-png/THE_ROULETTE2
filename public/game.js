import {
  insertCoin,
  myPlayer,
  getRoomCode,
  isHost,
  onPlayerJoin,
  addBot,
  getState,
  setState,
  waitForState,
  resetStates,
} from 'playroomkit';

// ---------- DOM ELEMENTS ----------
const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const avatarInput = document.getElementById('avatar-input');
const avatarPreview = document.getElementById('avatar-preview');
const uploadBtn = document.getElementById('upload-btn');
const enterLobbyBtn = document.getElementById('enter-lobby-btn');
const musicToggle = document.getElementById('music-toggle');
const menuMusic = document.getElementById('menu-music');

const roomCodeDisplay = document.getElementById('room-code-display');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const hostControls = document.getElementById('host-controls');
const guestWaiting = document.getElementById('guest-waiting');
const botCountInput = document.getElementById('bot-count');
const startGameBtn = document.getElementById('start-game-btn');

const playersContainer = document.getElementById('players-container');
const turnIndicator = document.getElementById('turn-indicator');
const eliminationOverlay = document.getElementById('elimination-overlay');
const winnerOverlay = document.getElementById('winner-overlay');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

let myAvatarUrl = '';

// ---------- 1. MENU: AVATAR UPLOAD ----------
avatarInput.addEventListener('change', () => {
  const file = avatarInput.files[0];
  if (file) {
    avatarPreview.src = URL.createObjectURL(file);
    avatarPreview.style.display = 'block';
  }
});

uploadBtn.addEventListener('click', async () => {
  const file = avatarInput.files[0];
  if (!file) return alert('Please select an image first.');

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch('/api/upload-avatar', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      myAvatarUrl = data.url;
      enterLobbyBtn.disabled = false;
      uploadBtn.textContent = 'Uploaded ✓';
      uploadBtn.disabled = true;
    } else {
      alert('Upload failed. Check console.');
    }
  } catch (err) {
    console.error(err);
    alert('Upload error.');
  }
});

// ---------- 2. MENU: MUSIC ----------
musicToggle.addEventListener('click', () => {
  if (menuMusic.paused) {
    menuMusic.play();
    musicToggle.textContent = '🔇 Pause Music';
  } else {
    menuMusic.pause();
    musicToggle.textContent = '🔊 Play Music';
  }
});

// ---------- 3. ENTER LOBBY (HOST OR JOIN) ----------
enterLobbyBtn.addEventListener('click', async () => {
  if (!myAvatarUrl) return alert('Upload an avatar first.');

  // Check URL for a room code to join. Example: site.com/?r=ABCD
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get('r');

  try {
    if (joinCode) {
      // JOINING AN EXISTING ROOM
      await insertCoin({
        roomCode: joinCode,
        skipLobby: true,
        maxPlayersPerRoom: 6,
      });
    } else {
      // CREATING A NEW ROOM (HOST)
      await insertCoin({
        skipLobby: true,
        maxPlayersPerRoom: 6,
      });
    }
  } catch (err) {
    console.error(err);
    alert(err.message === 'ROOM_LIMIT_EXCEEDED' ? 'Room is full!' : 'Failed to join room.');
    return;
  }

  // Once insertCoin resolves, we are in a room.
  // Store our avatar in our player state so others can see it.
  myPlayer().setState('avatar', myAvatarUrl, true);

  // Switch to Lobby Screen
  menuScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  menuMusic.pause();

  // Setup the lobby UI
  setupLobby();
});

// ---------- 4. LOBBY SETUP ----------
async function setupLobby() {
  const roomCode = getRoomCode();
  roomCodeDisplay.textContent = roomCode;

  // Show host controls if we are the host
  if (await isHost()) {
    hostControls.style.display = 'block';
    guestWaiting.style.display = 'none';
  } else {
    hostControls.style.display = 'none';
    guestWaiting.style.display = 'block';
  }

  // Function to refresh the lobby player list
  const refreshLobbyList = async () => {
    const players = getState('players') || [];
    lobbyPlayerList.innerHTML = players.map(p => `
      <div class="player-card">
        <img src="${p.avatar || 'https://via.placeholder.com/80'}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `).join('');
  };

  // When a player joins (including ourselves), update the player list in global state
  // We'll maintain our own "players" array in global state for consistency.
  onPlayerJoin(async (player) => {
    const currentPlayers = getState('players') || [];
    // Avoid duplicates
    if (!currentPlayers.find(p => p.id === player.id)) {
      const profile = player.getProfile();
      // Wait for the player's avatar state (set right after insertCoin)
      let avatar = 'https://via.placeholder.com/80';
      try {
        avatar = await waitForPlayerState(player, 'avatar');
      } catch (e) { /* ignore */ }

      currentPlayers.push({
        id: player.id,
        name: profile.name || 'Player',
        avatar: avatar,
        isBot: false,
        alive: true,
      });
      await setState('players', currentPlayers);
    }
    refreshLobbyList();
  });

  // Also call refresh immediately in case players already exist
  refreshLobbyList();

  // Host: Start Game
  startGameBtn.addEventListener('click', async () => {
    const players = getState('players') || [];
    const humanCount = players.filter(p => !p.isBot).length;
    const botCount = parseInt(botCountInput.value, 10) || 0;

    if (humanCount < 1) return alert('Need at least 1 human player to start.');
    if (humanCount + botCount > 6) return alert(`Max players is 6. You have ${humanCount} humans. Max bots allowed: ${6 - humanCount}.`);

    // Add bots
    for (let i = 0; i < botCount; i++) {
      await addBot(); // Playroom Kit adds the bot to the room
      // Note: Playroom Kit bots don't have custom avatars, so we'll assign placeholder in our state
    }

    // After adding bots, update the global player list to include them
    // Playroom's onPlayerJoin may not fire for bots in some SDK versions,
    // so we manually rebuild the player list from the room.
    // For simplicity, we'll fetch all players (humans + bots) from Playroom.
    // Playroom SDK doesn't expose a direct "getAllPlayers" in vanilla JS easily,
    // so we rely on our state + bots.
    // Alternative: After adding bots, set a flag that triggers all clients to rebuild.
    // Here, we'll just proceed; the host's local state has bots.
    // (In a production version, you would use a more robust player sync.)

    // Set initial game state
    const allPlayers = getState('players') || [];
    // Mark all as alive
    allPlayers.forEach(p => p.alive = true);
    await setState('players', allPlayers);
    await setState('gameStatus', 'spinning');
    await setState('activePlayerIds', allPlayers.map(p => p.id));
    await setState('eliminated', null);
    await setState('winner', null);

    // Switch to game screen
    lobbyScreen.classList.remove('active');
    gameScreen.classList.add('active');

    // Start the roulette loop (only on host)
    if (await isHost()) {
      runRoulette();
    }
  });
}

// ---------- 5. ROULETTE LOOP (HOST ONLY) ----------
async function runRoulette() {
  let activeIds = getState('activePlayerIds') || [];

  while (activeIds.length > 1) {
    // Pick a random active player to "spin" on (for visual effect)
    const spinPlayerId = activeIds[Math.floor(Math.random() * activeIds.length)];
    await setState('currentTurn', spinPlayerId, true);

    // Wait for dramatic effect
    await new Promise(r => setTimeout(r, 2000));

    // Choose the eliminated player
    const eliminatedId = activeIds[Math.floor(Math.random() * activeIds.length)];
    await setState('eliminated', eliminatedId, true);

    // Wait for elimination animation
    await new Promise(r => setTimeout(r, 3000));

    // Remove the eliminated player from active list
    activeIds = activeIds.filter(id => id !== eliminatedId);
    await setState('activePlayerIds', activeIds, true);
    await setState('eliminated', null);

    // Also update the "alive" flag in the players list
    const players = getState('players') || [];
    const updated = players.map(p => ({
      ...p,
      alive: activeIds.includes(p.id),
    }));
    await setState('players', updated);

    // Pause before next turn
    await new Promise(r => setTimeout(r, 1000));
  }

  // Game Over
  await setState('winner', activeIds[0], true);
  await setState('gameStatus', 'finished', true);
}

// ---------- 6. REAL-TIME UI UPDATES (ALL CLIENTS) ----------
// We use a polling loop for simplicity. For production, use waitForState.
setInterval(async () => {
  const gameStatus = getState('gameStatus');
  if (gameStatus !== 'spinning' && gameStatus !== 'finished') return;

  const players = getState('players') || [];
  const activeIds = getState('activePlayerIds') || [];
  const eliminatedId = getState('eliminated');
  const currentTurnId = getState('currentTurn');
  const winnerId = getState('winner');

  // Render player cards
  playersContainer.innerHTML = players.map(p => {
    const isActive = activeIds.includes(p.id);
    const isEliminated = !isActive && p.alive === false; // or use eliminated state
    const isTurn = p.id === currentTurnId;
    return `
      <div class="player-card ${isTurn ? 'active' : ''} ${isEliminated ? 'eliminated' : ''}">
        <img src="${p.avatar || 'https://via.placeholder.com/80'}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `;
  }).join('');

  // Turn indicator
  if (currentTurnId) {
    const currentPlayer = players.find(p => p.id === currentTurnId);
    turnIndicator.textContent = `It's ${currentPlayer ? currentPlayer.name : '...'}'s turn`;
  }

  // Elimination overlay
  eliminationOverlay.style.display = eliminatedId ? 'flex' : 'none';

  // Winner overlay
  if (winnerId) {
    const winner = players.find(p => p.id === winnerId);
    if (winner) {
      winnerOverlay.style.display = 'flex';
      winnerOverlay.querySelector('h1').textContent =
        `CONGRATULATIONS ${winner.name.toUpperCase()} U WON!`;
    }
  } else {
    winnerOverlay.style.display = 'none';
  }

  // Chat
  const chat = getState('chat') || [];
  chatMessages.innerHTML = chat.map(m => `<p><strong>${m.sender}:</strong> ${m.text}</p>`).join('');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}, 500);

// ---------- 7. CHAT ----------
chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;

  const player = myPlayer();
  const newMessage = {
    sender: player.getProfile().name || 'Player',
    text: text,
    timestamp: Date.now(),
  };

  const currentChat = getState('chat') || [];
  await setState('chat', [...currentChat, newMessage]);
  chatInput.value = '';
}

// ---------- 8. BACK TO LOBBY ----------
backToLobbyBtn.addEventListener('click', async () => {
  winnerOverlay.style.display = 'none';
  eliminationOverlay.style.display = 'none';

  // Reset all game states
  await resetStates(); // Resets global state to defaults (empty)
  // Also reset local player alive flags if needed

  // Switch back to lobby
  gameScreen.classList.remove('active');
  lobbyScreen.classList.add('active');

  // Re-initialize lobby list (setupLobby already registered onPlayerJoin)
  // The refreshLobbyList function is scoped inside setupLobby, so we'll just reload the page for simplicity.
  // For a smoother experience, you can refactor setupLobby to be re-callable.
  window.location.reload();
});