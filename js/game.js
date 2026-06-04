class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });

    this.players = {};
    this.bullets = [];
    this.keys = {};
    this.isShooting = false;
    this.shootCooldown = 0;
    this.localHealth = 100;
    this.remoteHealth = 100;
    this.isDead = false;
    this.isGameOver = false;
    this.running = false;
    this.lastShotData = null;

    this.setupRenderer();
    this.setupScene();
    this.setupControls();
    this.setupResize();
  }

  setupRenderer() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x1a1a2e);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    document.getElementById('game-container').prepend(this.renderer.domElement);
  }

  setupScene() {
    this.scene.fog = new THREE.Fog(0x1a1a2e, 60, 120);

    const ambient = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x4444ff, 0x444422, 0.6);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);

    this.buildArena();
  }

  buildArena() {
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(100, 40, 0x4444ff, 0x333366);
    gridHelper.position.y = -0.49;
    this.scene.add(gridHelper);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a5a,
      roughness: 0.7,
      metalness: 0.3,
    });

    const wallDefs = [
      { pos: [0, 2.5, -25], size: [50, 5, 1] },
      { pos: [0, 2.5, 25], size: [50, 5, 1] },
      { pos: [-25, 2.5, 0], size: [1, 5, 50] },
      { pos: [25, 2.5, 0], size: [1, 5, 50] },
    ];

    wallDefs.forEach((w) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
      mesh.position.set(...w.pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });

    for (let i = 0; i < 8; i++) {
      const pillarMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.6 + i * 0.03, 0.3, 0.3),
        roughness: 0.5,
        metalness: 0.6,
      });
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.8, 3, 8),
        pillarMat
      );
      const angle = (i / 8) * Math.PI * 2;
      const radius = 14;
      pillar.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);
    }

    const centerGlow = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4444ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      })
    );
    centerGlow.rotation.x = -Math.PI / 2;
    centerGlow.position.y = -0.45;
    this.scene.add(centerGlow);
  }

  setupControls() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.renderer.domElement) {
        const sensitivity = 0.002;
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y -= e.movementX * sensitivity;
        this.camera.rotation.x -= e.movementY * sensitivity;
        this.camera.rotation.x = Math.max(
          -Math.PI / 2.2,
          Math.min(Math.PI / 2.2, this.camera.rotation.x)
        );
      }
    });

    this.renderer.domElement.addEventListener('click', () => {
      if (!this.running) return;
      if (this.isDead) return;
      this.renderer.domElement.requestPointerLock();
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.running && !this.isDead) {
        this.isShooting = true;
      }
    });

    this.renderer.domElement.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isShooting = false;
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.renderer.domElement && this.running) {
      }
    });
  }

  setupResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  createPlayerMesh(color, isLocal) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.4,
      metalness: 0.6,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    const headMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.3,
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), headMat);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);

    const visorMat = new THREE.MeshStandardMaterial({
      color: isLocal ? 0x00ffff : 0xff4444,
      emissive: isLocal ? 0x00ffff : 0xff4444,
      emissiveIntensity: 0.3,
    });
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      visorMat
    );
    visor.position.set(0, 1.75, -0.3);
    visor.scale.set(1, 0.4, 0.3);
    group.add(visor);

    const shoulderMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.4,
    });

    [-1, 1].forEach((side) => {
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 8),
        shoulderMat
      );
      shoulder.position.set(side * 0.55, 1.45, 0);
      group.add(shoulder);
    });

    return group;
  }

  addLocalPlayer(position) {
    const mesh = this.createPlayerMesh(0x00aaff, true);
    mesh.position.copy(position);
    mesh.position.y = 0;
    this.scene.add(mesh);
    this.players.local = { mesh, health: 100, score: 0 };
    this.localHealth = 100;
    this.isDead = false;
    return mesh;
  }

  addRemotePlayer(position) {
    const mesh = this.createPlayerMesh(0xff4444, false);
    mesh.position.copy(position);
    mesh.position.y = 0;
    this.scene.add(mesh);
    this.players.remote = { mesh, health: 100, score: 0 };
    this.remoteHealth = 100;
    this.updateOpponentHealthUI();
    return mesh;
  }

  shoot() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);

    const origin = new THREE.Vector3();
    origin.copy(this.camera.position);

    const bulletMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.9,
    });
    const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bulletMat);

    bullet.position.copy(origin);
    this.scene.add(bullet);

    const speed = 60;
    const vel = dir.clone().multiplyScalar(speed);

    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.2,
    });

    this.bullets.push({
      mesh: bullet,
      trail: null,
      trailMat,
      velocity: vel,
      origin: origin.clone(),
      direction: dir.clone(),
      life: 2.0,
      isLocal: true,
    });

    this.lastShotData = {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: dir.x, y: dir.y, z: dir.z },
    };

    return this.lastShotData;
  }

  spawnRemoteBullet(origin, direction) {
    const o = new THREE.Vector3(origin.x, origin.y, origin.z);
    const d = new THREE.Vector3(direction.x, direction.y, direction.z);

    const bulletMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.9,
    });
    const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bulletMat);
    bullet.position.copy(o);
    this.scene.add(bullet);

    const speed = 60;
    const vel = d.clone().multiplyScalar(speed);

    this.bullets.push({
      mesh: bullet,
      trail: null,
      trailMat: null,
      velocity: vel,
      origin: o.clone(),
      direction: d.clone(),
      life: 2.0,
      isLocal: false,
    });
  }

  hitLocal() {
    if (this.isDead) return;
    this.localHealth = Math.max(0, this.localHealth - 15);
    this.players.local.health = this.localHealth;
    this.updateHealthUI();

    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.background = 'rgba(255, 0, 0, 0.2)';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '9999';
    flash.style.transition = 'opacity 0.2s';
    document.body.appendChild(flash);
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 200);
    }, 50);

    if (this.localHealth <= 0 && !this.isDead) {
      this.isDead = true;
      this.isShooting = false;
      document.exitPointerLock();
      this.onLocalDeath();
    }
  }

  updateHealthUI() {
    const bar = document.getElementById('health-bar');
    if (bar) bar.style.width = this.localHealth + '%';
  }

  updateOpponentHealthUI() {
    const bar = document.getElementById('opponent-health-bar');
    if (bar) bar.style.width = this.remoteHealth + '%';
  }

  checkBounds(pos) {
    const limit = 23;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));
  }

  getState() {
    if (!this.players.local) return null;
    return {
      position: {
        x: this.players.local.mesh.position.x,
        y: this.players.local.mesh.position.y,
        z: this.players.local.mesh.position.z,
      },
      rotation: {
        x: this.camera.rotation.x,
        y: this.camera.rotation.y,
      },
      health: this.localHealth,
      isDead: this.isDead,
    };
  }

  applyRemoteState(state) {
    if (!this.players.remote) return;
    const p = this.players.remote;
    p.mesh.position.set(state.position.x, state.position.y, state.position.z);
    p.mesh.rotation.y = state.rotation.y;
    if (state.health !== undefined) {
      p.health = state.health;
      this.remoteHealth = state.health;
      this.updateOpponentHealthUI();
    }
  }

  update(dt) {
    if (!this.running) return;

    const player = this.players.local;
    if (player && !this.isDead) {
      const speed = 12 * dt;
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(this.camera.quaternion);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(this.camera.quaternion);
      right.y = 0;
      right.normalize();

      const move = new THREE.Vector3(0, 0, 0);
      if (this.keys['w']) move.add(forward);
      if (this.keys['s']) move.sub(forward);
      if (this.keys['a']) move.sub(right);
      if (this.keys['d']) move.add(right);

      if (move.length() > 0) {
        move.normalize().multiplyScalar(speed);
        player.mesh.position.x += move.x;
        player.mesh.position.z += move.z;
      }

      this.checkBounds(player.mesh.position);

      this.camera.position.copy(player.mesh.position);
      this.camera.position.y += 1.5;

      player.mesh.rotation.y = this.camera.rotation.y;
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.add(b.velocity.clone().multiplyScalar(dt));
      b.life -= dt;

      if (b.isLocal) {
        const remote = this.players.remote;
        if (remote && !remote.mesh.parent) continue;
        if (remote && b.mesh.position.distanceTo(remote.mesh.position) < 1.0) {
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          if (this.onRemoteHit) this.onRemoteHit();
          continue;
        }
      } else {
        const local = this.players.local;
        if (local && !this.isDead && b.mesh.position.distanceTo(this.camera.position) < 1.0) {
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          this.hitLocal();
          continue;
        }
      }

      const limit = 30;
      if (
        Math.abs(b.mesh.position.x) > limit ||
        Math.abs(b.mesh.position.z) > limit ||
        b.life <= 0
      ) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }

    if (this.isShooting && !this.isDead) {
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0) {
        const shot = this.shoot();
        if (shot && this.onLocalShoot) this.onLocalShoot(shot);
        this.shootCooldown = 0.15;
      }
    }
  }

  render() {
    if (!this.running) return;
    this.renderer.render(this.scene, this.camera);
  }

  reset() {
    this.bullets.forEach((b) => this.scene.remove(b.mesh));
    this.bullets = [];

    if (this.players.local) {
      this.scene.remove(this.players.local.mesh);
      delete this.players.local;
    }
    if (this.players.remote) {
      this.scene.remove(this.players.remote.mesh);
      delete this.players.remote;
    }

    this.localHealth = 100;
    this.remoteHealth = 100;
    this.isDead = false;
    this.isGameOver = false;
    this.isShooting = false;
    this.shootCooldown = 0;
    this.keys = {};

    this.updateHealthUI();
    this.updateOpponentHealthUI();
  }

  destroy() {
    this.running = false;
    this.reset();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  addKillMessage(text) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const msg = document.createElement('div');
    msg.className = 'kill-message';
    msg.textContent = text;
    feed.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }
}
