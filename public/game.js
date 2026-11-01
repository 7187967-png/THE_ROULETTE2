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
let myUsername = ''; 
let currentLobbyCode = null;
let currentLobbyRef = null;
let isHost = false;

hostBtn.disabled = true;
joinBtn.disabled = true;

signInAnonymously(auth).catch((error) => console.error("Auth error:", error));
onAuthStateChanged(auth, (user) => {
  if (user) {
    myUid = user.uid;
    hostBtn.disabled = false;
    joinBtn.disabled = false;
  }
});

const checkUserDetails = () => {
    myAvatarUrl = window.myAvatarUrl || '';
    myUsername = usernameInput ? usernameInput.value.trim() : '';
    if (!myAvatarUrl) return alert("Upload avatar first!"), false;
    if (!myUsername) return alert("Enter username first!"), false;
    return true;
};

hostBtn.addEventListener('click', () => {
  if (!checkUserDetails()) return;
  const code = generateRoomCode();
  set(ref(db, 'lobbies/' + code), {
    host: myUid, status: 'waiting',
    players: { [myUid]: { name: myUsername, avatar: myAvatarUrl, isBot: false, alive: true } }
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
  
  if (Object.keys(playersObj).length >= 6) return alert("Lobby is full!");
  if (Object.values(playersObj).some(p => p.name.toLowerCase() === myUsername.toLowerCase())) return alert("Name taken!");

  await update(ref(db, `lobbies/${code}/players/${myUid}`), { name: myUsername, avatar: myAvatarUrl, isBot: false, alive: true });
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

    // Update Lobby UI (Uses the non-absolute CSS classes now)
    lobbyPlayerList.innerHTML = playerList.map(p => `
      <div class="player-card">
        <img src="${p.avatar}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `).join('');

    hostControls.style.display = isHost ? 'block' : 'none';
    guestWaiting.style.display = isHost ? 'none' : 'block';

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
  if (humanCount + botCount < 2) return alert("Need 2+ players!");

  const updates = {};
  const activePlayerIds = Object.keys(playersObj);

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

    // 1. Pick the "target" to make it look like it's spinning towards someone
    const spinPick = active[Math.floor(Math.random() * active.length)];
    await update(ref(db, `lobbies/${currentLobbyCode}/game`), { currentTurn: spinPick, eliminated: null });
    
    // Wait for the spin animation to finish
    setTimeout(async () => {
      // 2. Pick the victim (Eliminate)
      const eliminatedId = active[Math.floor(Math.random() * active.length)];
      await update(ref(db, `lobbies/${currentLobbyCode}/game`), { eliminated: eliminatedId });
      
      // Wait for the "suck in" animation (1.5 seconds)
      setTimeout(async () => {
        // 3. Remove victim from active list
        active = active.filter(id => id !== eliminatedId);
        await update(ref(db, `lobbies/${currentLobbyCode}/game`), { activePlayers: active, eliminated: null, currentTurn: null });
        await update(ref(db, `lobbies/${currentLobbyCode}/players/${eliminatedId}`), { alive: false });
        step(); // Run next turn
      }, 1500); 
    }, 2500); 
  };
  step();
}

// --- THE TABLE MATH ANIMATION LOGIC ---
function updateGameUI(data, playerList) {
  const game = data.game || {};
  const totalPlayers = playerList.length;
  
  // Calculate circle positions
  playersContainer.innerHTML = playerList.map((p, index) => {
    // Start at top (-90 degrees), distribute evenly
    const angle = (index / totalPlayers) * 2 * Math.PI - (Math.PI / 2);
    // Radius is 40% of the table
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);

    const isTurn = (p.id === game.currentTurn);
    const isDead = !p.alive;
    const isBeingTaken = (p.id === game.eliminated); // Triggers suck in animation

    return `
      <div class="player-card ${isTurn ? 'active' : ''} ${isDead ? 'eliminated' : ''} ${isBeingTaken ? 'being-taken' : ''}"
           style="left: ${x}%; top: ${y}%;">
        <img src="${p.avatar}" alt="${p.name}" />
        <span>${p.name}${p.isBot ? ' 🤖' : ''}</span>
      </div>
    `;
  }).join('');

  // Update turn text
  if (game.currentTurn && !game.eliminated) {
    const p = playerList.find(x => x.id === game.currentTurn);
    turnIndicator.textContent = `Targeting ${p ? p.name : '...'}!`;
  } else if (game.eliminated) {
    turnIndicator.textContent = "TAKEN!";
  } else {
    turnIndicator.textContent = "Spinning...";
  }

  if (data.status === 'finished' && game.winner) {
    const winnerPlayer = playerList.find(x => x.id === game.winner);
    winnerOverlay.style.display = 'flex';
    winnerText.textContent = `CONGRATULATIONS ${winnerPlayer ? winnerPlayer.name.toUpperCase() : ''} U WON!`;
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
