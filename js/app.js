const network = new Network();
let game = null;
let animFrameId = null;
let lastTime = 0;
let stateSendInterval = null;
let hostPeerId = null;
let isConnected = false;

const $ = (id) => document.getElementById(id);

const connectionMenu = $('connection-menu');
const gameHud = $('game-hud');
const gameOverOverlay = $('game-over-overlay');
const hostBtn = $('host-btn');
const joinBtn = $('join-btn');
const peerIdInput = $('peer-id-input');
const connectionStatus = $('connection-status');
const peerIdDisplay = $('peer-id-display');
const peerIdValue = $('peer-id-value');
const copyIdBtn = $('copy-id-btn');
const gameOverTitle = $('game-over-title');
const gameOverMessage = $('game-over-message');
const restartBtn = $('restart-btn');

hostBtn.addEventListener('click', hostGame);
joinBtn.addEventListener('click', joinGame);
peerIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});
restartBtn.addEventListener('click', restartGame);

copyIdBtn.addEventListener('click', () => {
  const id = peerIdValue.textContent;
  if (!id) return;
  navigator.clipboard.writeText(id).then(() => {
    copyIdBtn.textContent = 'COPIED!';
    copyIdBtn.classList.add('copied');
    setTimeout(() => {
      copyIdBtn.textContent = 'COPY';
      copyIdBtn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = id;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    copyIdBtn.textContent = 'COPIED!';
    copyIdBtn.classList.add('copied');
    setTimeout(() => {
      copyIdBtn.textContent = 'COPY';
      copyIdBtn.classList.remove('copied');
    }, 2000);
  });
});

network.onOpen = () => {
  isConnected = true;
  showStatus('Connected!', 'connected');
  startGame();
};

network.onClose = () => {
  isConnected = false;
  if (stateSendInterval) {
    clearInterval(stateSendInterval);
    stateSendInterval = null;
  }
  showConnectionLost();
};

network.onError = (err) => {
  console.error('Network error:', err);
  showStatus('Connection failed: ' + err.message, 'error');
  setTimeout(() => {
    hostBtn.disabled = false;
    joinBtn.disabled = false;
  }, 2000);
};

network.onData = (data) => {
  if (!game) return;
  switch (data.type) {
    case 'state':
      game.applyRemoteState(data);
      break;
    case 'shoot':
      game.spawnRemoteBullet(data.origin, data.direction);
      break;
    case 'hit':
      if (!game.isDead) {
        game.hitLocal();
      }
      break;
    case 'player_death':
      game.isGameOver = true;
      game.isShooting = false;
      showGameOver(true, data.killerId);
      break;
    case 'restart':
      resetForNewRound();
      break;
  }
};

async function hostGame() {
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  showStatus('Creating game...', 'connecting');

  try {
    hostPeerId = await network.host();
    showStatus(`Waiting for opponent...`, 'connecting');
    peerIdDisplay.classList.remove('hidden');
    peerIdValue.textContent = hostPeerId;
    copyIdBtn.textContent = 'COPY';
    copyIdBtn.classList.remove('copied');
  } catch (err) {
    showStatus('Failed to create game: ' + err.message, 'error');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
  }
}

async function joinGame() {
  const targetId = peerIdInput.value.trim();
  if (!targetId) {
    showStatus('Please enter a peer ID', 'error');
    return;
  }

  hostBtn.disabled = true;
  joinBtn.disabled = true;
  showStatus('Connecting...', 'connecting');

  try {
    await network.join(targetId);
  } catch (err) {
    showStatus('Failed to join: ' + err.message, 'error');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
  }
}

function showStatus(msg, type) {
  connectionStatus.classList.remove('hidden', 'connecting', 'connected', 'error');
  connectionStatus.classList.add(type);
  connectionStatus.textContent = msg;
}

function stopGameLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function startGame() {
  stopGameLoop();

  connectionMenu.classList.add('hidden');
  gameHud.classList.remove('hidden');
  gameOverOverlay.classList.add('hidden');

  if (game) {
    game.destroy();
  }

  game = new Game();

  game.onLocalShoot = (shotData) => {
    network.send({ type: 'shoot', ...shotData });
  };

  game.onRemoteHit = () => {
    network.send({ type: 'hit' });
  };

  game.onLocalDeath = () => {
    game.isGameOver = true;
    game.isShooting = false;
    document.exitPointerLock();
    network.send({
      type: 'player_death',
      killerId: 'remote',
    });
    setTimeout(() => {
      showGameOver(false, 'remote');
    }, 300);
  };

  const localSpawn = network.isHost
    ? new THREE.Vector3(-15, 0, 0)
    : new THREE.Vector3(15, 0, 0);
  const remoteSpawn = network.isHost
    ? new THREE.Vector3(15, 0, 0)
    : new THREE.Vector3(-15, 0, 0);

  game.addLocalPlayer(localSpawn);
  game.addRemotePlayer(remoteSpawn);

  game.updateHealthUI();
  game.updateOpponentHealthUI();

  game.running = true;

  if (stateSendInterval) clearInterval(stateSendInterval);
  stateSendInterval = setInterval(() => {
    if (game && game.running && isConnected) {
      const state = game.getState();
      if (state) network.send({ type: 'state', ...state });
    }
  }, 50);

  lastTime = performance.now();
  gameLoop(lastTime);
}

function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (game && game.running) {
    game.update(dt);
    game.render();
    animFrameId = requestAnimationFrame(gameLoop);
  }
}

function showGameOver(isWinner, killerId) {
  gameOverOverlay.classList.remove('hidden');
  document.exitPointerLock();

  if (isWinner) {
    gameOverTitle.textContent = 'VICTORY';
    gameOverTitle.className = 'winner';
    gameOverMessage.textContent = 'You eliminated your opponent!';
    game.addKillMessage('You eliminated the enemy!');
  } else {
    gameOverTitle.textContent = 'DEFEATED';
    gameOverTitle.className = 'loser';
    gameOverMessage.textContent = 'You were eliminated...';
    game.addKillMessage('You were eliminated!');
  }
}

function restartGame() {
  network.send({ type: 'restart' });
  resetForNewRound();
}

function resetForNewRound() {
  gameOverOverlay.classList.add('hidden');
  if (!game) return;

  game.reset();

  const localSpawn = network.isHost
    ? new THREE.Vector3(-15, 0, 0)
    : new THREE.Vector3(15, 0, 0);
  const remoteSpawn = network.isHost
    ? new THREE.Vector3(15, 0, 0)
    : new THREE.Vector3(-15, 0, 0);

  game.addLocalPlayer(localSpawn);
  game.addRemotePlayer(remoteSpawn);
  game.isGameOver = false;
  game.isDead = false;
  game.running = true;

  game.updateHealthUI();
  game.updateOpponentHealthUI();
}

function showConnectionLost() {
  stopGameLoop();

  gameHud.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  connectionMenu.classList.remove('hidden');
  peerIdDisplay.classList.add('hidden');
  showStatus('Connection lost. Host a new game or join another.', 'error');
  hostBtn.disabled = false;
  joinBtn.disabled = false;
  hostPeerId = null;

  if (stateSendInterval) {
    clearInterval(stateSendInterval);
    stateSendInterval = null;
  }
  if (game) {
    game.destroy();
    game = null;
  }
}
