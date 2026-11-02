import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, onDisconnect, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhpEonUevmgZnV1Dq-c_JqAq80gH3sDcg",
  authDomain: "roulette-c19e5.firebaseapp.com",
  databaseURL: "https://roulette-c19e5-default-rtdb.firebaseio.com/", 
  projectId: "roulette-c19e5",
  storageBucket: "roulette-c19e5.firebasestorage.app",
  messagingSenderId: "457070238408",
  appId: "1:457070238408:web:f08080f416ef008dfb63fd"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM Elements
const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const joinCodeInput = document.getElementById('join-code-input');
const usernameInput = document.getElementById('username-input'); 
const joinBtn = document.getElementById('join-btn');
const hostBtn = document.getElementById('host-btn');
const roomCodeDisplay = document.getElementById('room-code-display');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const hostControls = document.getElementById('host-controls');
const guestWaiting = document.getElementById('guest-waiting');
const botCountInput = document.getElementById('bot-count');
const startGameBtn = document.getElementById('start-game-btn');
const orbit3d = document.getElementById('orbit-3d');
const table3d = document.getElementById('table-3d');
const turnIndicator = document.getElementById('turn-indicator');
const winnerOverlay = document.getElementById('winner-overlay');
const winnerText = document.getElementById('winner-text');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

let myUid = null;
let currentLobbyCode = null;
let currentLobbyRef = null;
let isHost = false;

// Disable buttons until auth and avatar are ready
hostBtn.disabled = true;
joinBtn.disabled = true;

signInAnonymously(auth).catch((error) => console.error("Auth error:", error));
onAuthStateChanged(auth, (user) => {
  if (user) {
    myUid = user.uid;
    // Re-check avatar and username from localStorage
    if (window.myAvatarUrl && usernameInput.value.trim() !== '') {
        hostBtn.disabled = false;
        joinBtn.disabled = false;
    }
  }
});

const checkUserDetails = () => {
    const myAvatarUrl = window.myAvatarUrl || '';
    const myUsername = usernameInput ? usernameInput.value.trim() : '';
    if (!myAvatarUrl) return alert("Upload avatar first!"), false;
    if (!myUsername) return alert("Enter username first!"), false;
    return true;
};

// Re-enable buttons if user types name after avatar is uploaded
usernameInput.addEventListener('input', () => {
    if (window.myAvatarUrl && usernameInput.value.trim() !== '' && myUid) {
        hostBtn.disabled = false;
        joinBtn.disabled = false;
    } else {
        hostBtn.disabled = true;
        joinBtn.disabled = true;
    }
});

hostBtn.addEventListener('click', () => {
  if (!checkUserDetails()) return;
  const code = generateRoomCode();
  const myUsername = usernameInput.value.trim();
  set(ref(db, 'lobbies/' + code), {
    host: myUid, status: 'waiting',
    players: { [myUid]: { name: myUsername, avatar: window.myAvatarUrl, isBot: false, alive: true } }
  }).then(() => enterLobby(code));
});

joinBtn.addEventListener('click', async () => {
  if (!checkUserDetails()) return;
  const code = joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) return alert("Invalid code.");
  
  const snapshot = await get(ref(db, 'lobbies/' + code));
  if (!snapshot.exists()) return alert("Lobby not found!");
  const lobby = snapshot.val();
  const playersObj = lobby.players || {};
  const myUsername = usernameInput.value.trim();
  
  if (Object.keys(playersObj).length >= 6) return alert("Lobby is full!");
  if (Object.values(playersObj).some(p => p.name.toLowerCase() === myUsername.toLowerCase())) return alert("Name taken!");

  await update(ref(db, `lobbies/${code}/players/${myUid}`), { name: myUsername, avatar: window.myAvatarUrl, isBot: false, alive: true });
  enterLobby(code);
});

function enterLobby(code) {
  currentLobbyCode = code;
  currentLobbyRef = ref(db, 'lobbies/' + code);
  menuScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  roomCodeDisplay.textContent = code;
  onDisconnect(ref(db, `lobbies/${code}/players/${myUid}`)).remove();

  onValue(currentLobbyRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) { window.location.reload(); return; }

    const players = data.players || {};
    const playerList = Object.keys(players).map(id => ({ id, ...players[id] }));
    isHost = (data.host === myUid);

    // Render Lobby
    lobbyPlayerList.innerHTML = playerList.map(p => `
      <div class="player-card">
        <img src="${p.avatar}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `).join('');

    hostControls.style.display = isHost ? 'flex' : 'none';
    guestWaiting.style.display = isHost ? 'none' : 'block';

    // Handle Screen Transitions
    if (data.status === 'playing' || data.status === 'finished') {
      lobbyScreen.classList.remove('active');
      gameScreen.classList.add('active');
      updateGameUI(data, playerList);
    } else if (data.status === 'waiting') {
      gameScreen.classList.remove('active');
      lobbyScreen.classList.add('active');
      winnerOverlay.style.display = 'none';
      table3d.classList.remove('spinning', 'vortex-active');
    }
  });

  onValue(ref(db, `lobbies/${code}/chat`), (snapshot) => {
    const msgs = snapshot.val();
    if (msgs) {
      chatMessages.innerHTML = Object.values(msgs).map(m => `<p><strong>${m.sender}:</strong> ${m.text}</p>`).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
}

chatSendBtn.addEventListener('click', async () => {
  const text = chatInput.value.trim();
  const myUsername = usernameInput.value.trim();
  if (!text || !currentLobbyCode || !myUsername) return;
  await push(ref(db, `lobbies/${currentLobbyCode}/chat`), { sender: myUsername, text, timestamp: Date.now() });
  chatInput.value = '';
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') chatSendBtn.click(); });

startGameBtn.addEventListener('click', async () => {
  const snapshot = await get(currentLobbyRef);
  const data = snapshot.val();
  const playersObj = data.players;
  
  const humanCount = Object.keys(playersObj).filter(id => !playersObj[id].isBot).length;
  const botCount = parseInt(botCountInput.value, 10) || 0;

  if (humanCount + botCount > 6) return alert("Max 6 players!");
  if (humanCount + botCount < 2) return alert("Need at least 2 players!");

  const updates = {};
  const activePlayerIds = Object.keys(playersObj);

  for (let i = 0; i < botCount; i++) {
    const botId = 'bot_' + Date.now() + '_' + i;
    updates[`players/${botId}`] = { 
        name: `Bot ${i+1}`, 
        avatar: 'https://cdn-icons-png.flaticon.com/512/616/616430.png', 
        isBot: true, 
        alive: true 
    };
    activePlayerIds.push(botId);
  }
  
  updates['status'] = 'playing';
  updates['game'] = { activePlayers: activePlayerIds, currentTurn: null, eliminated: null, winner: null };
  
  await update(currentLobbyRef, updates);
  if (isHost) runHostGameLoop();
});

async function runHostGameLoop() {
  const step = async () => {
    const snapshot = await get(currentLobbyRef);
    const data = snapshot.val();
    if (!data || data.status !== 'playing' || !data.game) return;

    let active = data.game.activePlayers || [];
    if (active.length <= 1) {
      await update(ref(db, `lobbies/${currentLobbyCode}`), { status: 'finished', 'game/winner': active[0] || null });
      return;
    }

    const spinPick = active[Math.floor(Math.random() * active.length)];
    await update(ref(db, `lobbies/${currentLobbyCode}/game`), { currentTurn: spinPick, eliminated: null });
    
    setTimeout(async () => {
      const eliminatedId = active[Math.floor(Math.random() * active.length)];
      await update(ref(db, `lobbies/${currentLobbyCode}/game`), { eliminated: eliminatedId, currentTurn: null });
      
      setTimeout(async () => {
        active = active.filter(id => id !== eliminatedId);
        await update(ref(db, `lobbies/${currentLobbyCode}/game`), { activePlayers: active, eliminated: null });
        await update(ref(db, `lobbies/${currentLobbyCode}/players/${eliminatedId}`), { alive: false });
        step(); 
      }, 2000); 
    }, 3000); 
  };
  step();
}

function updateGameUI(data, playerList) {
  const game = data.game || {};
  const totalPlayers = playerList.length;
  
  orbit3d.innerHTML = playerList.map((p, index) => {
    const angle = (index / totalPlayers) * 360;
    const radius = 180; 

    const isTurn = (p.id === game.currentTurn);
    const isDead = !p.alive;
    const isBeingTaken = (p.id === game.eliminated);

    return `
      <div class="player-3d ${isTurn ? 'active' : ''} ${isDead ? 'eliminated' : ''} ${isBeingTaken ? 'being-taken' : ''}"
           style="--angle: ${angle}deg; transform: rotateZ(${angle}deg) translateY(-${radius}px);">
        <div class="card-inner">
          <img src="${p.avatar}" alt="${p.name}" />
          <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
        </div>
      </div>
    `;
  }).join('');

  if (game.currentTurn) {
    table3d.classList.add('spinning');
    table3d.classList.remove('vortex-active');
    const p = playerList.find(x => x.id === game.currentTurn);
    turnIndicator.textContent = `Spinning for ${p ? p.name : '...'}`;
    turnIndicator.style.color = "#f5c542"; 
  } 
  else if (game.eliminated) {
    table3d.classList.remove('spinning');
    table3d.classList.add('vortex-active');
    turnIndicator.textContent = `TAKEN INTO THE DARKNESS!`;
    turnIndicator.style.color = "#ff1a1a"; 
  } 
  else {
    table3d.classList.remove('spinning', 'vortex-active');
    turnIndicator.textContent = `Spinning...`;
    turnIndicator.style.color = "#fff";
  }

  if (data.status === 'finished' && game.winner) {
    table3d.classList.remove('spinning', 'vortex-active');
    const winnerPlayer = playerList.find(x => x.id === game.winner);
    winnerOverlay.style.display = 'flex';
    winnerText.textContent = `WINNER: ${winnerPlayer ? winnerPlayer.name.toUpperCase() : ''}`;
  }
}

backToLobbyBtn.addEventListener('click', async () => {
  if (!isHost) return alert("Only host can restart."); 
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
