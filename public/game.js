import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove, onDisconnect, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyAhpEonUevmgZnV1Dq-c_JqAq80gH3sDcg",
  authDomain: "roulette-c19e5.firebaseapp.com",
  databaseURL: "https://roulette-c19e5-default-rtdb.firebaseio.com/", 
  projectId: "roulette-c19e5",
  storageBucket: "roulette-c19e5.firebasestorage.app",
  messagingSenderId: "457070238408",
  appId: "1:457070238408:web:f08080f416ef008dfb63fd",
  measurementId: "G-WJRTGBTRYE"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM Elements
const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const joinCodeInput = document.getElementById('join-code-input');
const usernameInput = document.getElementById('username-input'); // NEW: Username Input
const joinBtn = document.getElementById('join-btn');
const hostBtn = document.getElementById('host-btn');
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
const winnerText = document.getElementById('winner-text');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

let myUid = null;
let myAvatarUrl = ''; 
let myUsername = ''; // NEW: Store username
let currentLobbyCode = null;
let currentLobbyRef = null;
let isHost = false;
let hostGameLoopInterval = null;

// Disable buttons until auth is ready
hostBtn.disabled = true;
joinBtn.disabled = true;

// --- AUTHENTICATION ---
signInAnonymously(auth).catch((error) => {
    console.error("Auth error:", error);
    alert("Authentication failed! Did you enable Anonymous Sign-in in Firebase Console?");
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    myUid = user.uid;
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    console.log("Logged in as:", myUid);
  } else {
    myUid = null;
    hostBtn.disabled = true;
    joinBtn.disabled = true;
  }
});

// --- VALIDATION: CHECK AVATAR AND USERNAME ---
const checkUserDetails = () => {
    myAvatarUrl = window.myAvatarUrl || '';
    myUsername = usernameInput ? usernameInput.value.trim() : '';

    if (!myAvatarUrl) {
        alert("Please upload and confirm an avatar first!");
        return false;
    }
    if (!myUsername) {
        alert("Please enter a username before joining!");
        return false;
    }
    return true;
};

// --- LOBBY LOGIC ---
hostBtn.addEventListener('click', () => {
  if (!myUid) return alert("Waiting for authentication...");
  if (!checkUserDetails()) return; // Checks both avatar and username
  
  const code = generateRoomCode();
  const lobbyRef = ref(db, 'lobbies/' + code);
  
  set(lobbyRef, {
    host: myUid,
    status: 'waiting',
    players: {
      [myUid]: { name: myUsername, avatar: myAvatarUrl, isBot: false, alive: true } // Uses chosen username
    }
  }).then(() => enterLobby(code)).catch(err => alert("Database error: " + err.message));
});

joinBtn.addEventListener('click', async () => {
  if (!myUid) return alert("Waiting for authentication...");
  if (!checkUserDetails()) return; // Checks both avatar and username
  
  const code = joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) return alert("Invalid code.");
  
  const snapshot = await get(ref(db, 'lobbies/' + code));
  if (!snapshot.exists()) return alert("Lobby not found!");
  
  const lobby = snapshot.val();
  const playersObj = lobby.players || {};
  
  // Check if username is already taken in this lobby
  const nameExists = Object.values(playersObj).some(p => p.name.toLowerCase() === myUsername.toLowerCase());
  if (nameExists) return alert("That username is already taken in this lobby!");

  const playerCount = Object.keys(playersObj).length;
  if (playerCount >= 6) return alert("Lobby is full!");

  await update(ref(db, `lobbies/${code}/players/${myUid}`), {
    name: myUsername, avatar: myAvatarUrl, isBot: false, alive: true // Uses chosen username
  });
  enterLobby(code);
});

function enterLobby(code) {
  currentLobbyCode = code;
  currentLobbyRef = ref(db, 'lobbies/' + code);
  menuScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  roomCodeDisplay.textContent = code;

  // Remove player from DB if they close tab
  onDisconnect(ref(db, `lobbies/${code}/players/${myUid}`)).remove();

  // Listen to lobby updates
  onValue(currentLobbyRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) { window.location.reload(); return; }

    // SAFETY CHECK: Get all players
    const players = data.players || {};
    const playerList = Object.keys(players).map(id => ({ id, ...players[id] }));
    isHost = (data.host === myUid);

    // Update Lobby UI (Displays everyone in the lobby)
    lobbyPlayerList.innerHTML = playerList.map(p => `
      <div class="player-card">
        <img src="${p.avatar}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `).join('');

    hostControls.style.display = isHost ? 'block' : 'none';
    guestWaiting.style.display = isHost ? 'none' : 'block';

    // Handle Game State Changes
    if (data.status === 'playing' || data.status === 'finished') {
      lobbyScreen.classList.remove('active');
      gameScreen.classList.add('active');
      updateGameUI(data, playerList);
    } else if (data.status === 'waiting') {
      gameScreen.classList.remove('active');
      lobbyScreen.classList.add('active');
      winnerOverlay.style.display = 'none';
      eliminationOverlay.style.display = 'none';
    }
  });

  // Listen to chat
  onValue(ref(db, `lobbies/${code}/chat`), (snapshot) => {
    const msgs = snapshot.val();
    if (msgs) {
      chatMessages.innerHTML = Object.values(msgs).map(m => `<p><strong>${m.sender}:</strong> ${m.text}</p>`).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
}

// --- CHAT ---
chatSendBtn.addEventListener('click', async () => {
  const text = chatInput.value.trim();
  if (!text || !currentLobbyCode || !myUsername) return;
  // Uses chosen username for chat
  await push(ref(db, `lobbies/${currentLobbyCode}/chat`), { sender: myUsername, text, timestamp: Date.now() });
  chatInput.value = '';
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') chatSendBtn.click(); });

// --- HOST: START GAME & BOTS ---
startGameBtn.addEventListener('click', async () => {
  if (!currentLobbyRef) return;
  const snapshot = await get(currentLobbyRef);
  const data = snapshot.val();
  
  if (!data || !data.players) return alert("Lobby data not found.");

  const playersObj = data.players;
  const humanCount = Object.keys(playersObj).filter(id => !playersObj[id].isBot).length;
  const botCount = parseInt(botCountInput.value, 10) || 0;

  if (humanCount + botCount > 6) return alert("Max players is 6!");
  if (humanCount + botCount < 2) return alert("Need at least 2 players (including bots)!");

  const updates = {};
  const activePlayerIds = Object.keys(playersObj); // Start with existing humans

  // Add Bots
  for (let i = 0; i < botCount; i++) {
    const botId = 'bot_' + Date.now() + '_' + i;
    updates[`players/${botId}`] = { name: `Bot ${i+1}`, avatar: 'https://cdn-icons-png.flaticon.com/512/616/616430.png', isBot: true, alive: true };
    activePlayerIds.push(botId);
  }
  
  updates['status'] = 'playing';
  updates['game'] = { activePlayers: activePlayerIds, currentTurn: null, eliminated: null, winner: null };

  await update(currentLobbyRef, updates);
  
  if (isHost) runHostGameLoop();
});

// --- HOST: GAME LOOP ---
async function runHostGameLoop() {
  if (hostGameLoopInterval) clearInterval(hostGameLoopInterval);
  
  const step = async () => {
    const snapshot = await get(currentLobbyRef);
    const data = snapshot.val();
    if (!data || data.status !== 'playing' || !data.game) return;

    let active = data.game.activePlayers || [];
    if (active.length <= 1) {
      // Game Over
      await update(ref(db, `lobbies/${currentLobbyCode}`), {
        status: 'finished',
        'game/winner': active[0] || null
      });
      return;
    }

    // 1. Spin
    const spinPick = active[Math.floor(Math.random() * active.length)];
    await update(ref(db, `lobbies/${currentLobbyCode}/game`), { currentTurn: spinPick, eliminated: null });
    
    setTimeout(async () => {
      // 2. Eliminate
      const eliminatedId = active[Math.floor(Math.random() * active.length)];
      await update(ref(db, `lobbies/${currentLobbyCode}/game`), { eliminated: eliminatedId });
      
      setTimeout(async () => {
        // 3. Remove player
        active = active.filter(id => id !== eliminatedId);
        await update(ref(db, `lobbies/${currentLobbyCode}/game`), { activePlayers: active, eliminated: null, currentTurn: null });
        await update(ref(db, `lobbies/${currentLobbyCode}/players/${eliminatedId}`), { alive: false });
        
        // Next Turn
        step();
      }, 3000);
    }, 2000);
  };

  step();
}

// --- CLIENT: RENDER GAME UI ---
function updateGameUI(data, playerList) {
  const game = data.game || {};
  
  playersContainer.innerHTML = playerList.map(p => {
    const isTurn = (p.id === game.currentTurn);
    const isDead = !p.alive;
    return `
      <div class="player-card ${isTurn ? 'active' : ''} ${isDead ? 'eliminated' : ''}">
        <img src="${p.avatar}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `;
  }).join('');

  if (game.currentTurn) {
    const p = playerList.find(x => x.id === game.currentTurn);
    turnIndicator.textContent = `It's ${p ? p.name : '...'}'s turn`;
  } else {
    turnIndicator.textContent = "Spinning...";
  }

  eliminationOverlay.style.display = game.eliminated ? 'flex' : 'none';

  if (data.status === 'finished' && game.winner) {
    const winnerPlayer = playerList.find(x => x.id === game.winner);
    winnerOverlay.style.display = 'flex';
    winnerText.textContent = `CONGRATULATIONS ${winnerPlayer ? winnerPlayer.name.toUpperCase() : ''} U WON!`;
  }
}

// --- RETURN TO LOBBY ---
backToLobbyBtn.addEventListener('click', async () => {
  if (!isHost) return alert("Only the host can restart the game."); 
  
  await update(currentLobbyRef, { status: 'waiting', game: null });
  
  const snapshot = await get(ref(db, `lobbies/${currentLobbyCode}/players`));
  if (snapshot.exists()) {
      const updates = {};
      snapshot.forEach(child => { updates[`players/${child.key}/alive`] = true; });
      await update(currentLobbyRef, updates);
  }
});

function generateRoomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  return code;
}
