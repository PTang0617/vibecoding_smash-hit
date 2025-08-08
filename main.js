// Smash Hit Web - Game Over on Glass Collision

let scene, camera, renderer, world;
let physicsMaterial;
let ballCount = 20;
let score = 0;
let isGameOver = false;
let gameStarted = false;
const shootBalls = [];
const ballGhosts = []; // 用來存每顆殘影
let ghostFrameCounter = 0;
let glassBlocks = [];
let crystals = [];
let crosshair;
let isPaused = false;
let pauseOverlay = null;
let speedMultiplier = 1;
let lastSpeedIncreaseTime = Date.now();
let playerName = "匿名";
let glassChance = 0.7; // 初始玻璃出現機率 70%
let spawnInterval = null;  // 新增這行
const soundHit = new Audio("hit.mp3");
const soundCrystal = new Audio("crystal.mp3");
const soundShoot = new Audio("shoot.mp3");
let isMuted = false;
const bgm = new Audio("bgm.mp3");
bgm.loop = true; // 讓音樂循環播放
bgm.volume = 0.4; // 可調整音量（0 ~ 1）
const speedLines = [];
let currentSpeedDisplay = 0; // 顯示用（平滑過的）速度值（km/h）
const LEVELS = [
  {
    name: "Level 1",
    // 第一關：基本的水晶與玻璃（沒有左右移動）
    glassChance: 0.7,
    movingGlassChance: 0.0,
    spawnIntervalMs: 800
  },
  {
    name: "Level 2",
    // 第二關：加入紅色左右移動玻璃
    glassChance: 0.75,
    movingGlassChance: 0.35, // 有 35% 機率生成會左右移動的玻璃
    spawnIntervalMs: 700
  },
  // 之後要擴充只要往陣列 push 新關卡物件即可
];

let currentLevelIndex = 0;
let levelStartTime = 0;      // 啟用該關的起始時間戳
const LEVEL_DURATIONS = [30]; // 每關持續秒數：第一關 30 秒後進第二關（之後可加長/每關一個值）
let transitionGlass = null;      // 厚玻璃物件
let transitionGlassHP = 0;       // 血量
let isTransitioningLevel = false; // 是否正在過關
let camShakeUntil = 0;
let camBase = new THREE.Vector3(0, 1.5, 5);
let gateHitsOverlay = null;  // 顯示「還需 N 下」

// 初始化 Firebase
const firebaseConfig = {
  apiKey: "AIzaSyARbdk870zyGYmnualAhPFfhGyRBcFUUdQ",
  authDomain: "smashhitleaderboard.firebaseapp.com",
  projectId: "smashhitleaderboard",
  storageBucket: "smashhitleaderboard.firebasestorage.app",
  messagingSenderId: "897316926520",
  appId: "1:897316926520:web:2a051d41e1383c2241e2cd",
  measurementId: "G-29DQ1B1BXC"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

init();

function init() {
  document.getElementById("start-button").onclick = async () => {
    const input = document.getElementById("player-name-input").value.trim();
    const warning = document.getElementById("name-warning");

    if (!input) {
      warning.textContent = "請輸入名字";
      return;
    }

    // 檢查是否重複
    const snapshot = await db.collection("scores").where("name", "==", input).get();
    if (!snapshot.empty) {
      warning.textContent = "這個名字已經被使用，請換一個";
      return;
    }

    // ✅ 合法，清除警告並開始遊戲
    warning.textContent = "";
    document.getElementById("menu").style.display = "none";
    document.getElementById("speed-display").style.display = "block";
    playerName = input;
    gameStarted = true;

    // 顯示「按下空白鍵可暫停」提示
    const hint = document.getElementById("center-hint");
    hint.classList.add("show");

    setTimeout(() => {
      hint.classList.remove("show");
    }, 2000);

    currentLevelIndex = 0;       
    applyLevelConfig();           
    levelStartTime = Date.now();   
    loadLeaderboard();
    createSpeedLines();
    bgm.play();
    animate();
  };

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.5, 5);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(0, 5, 5);
  scene.add(light);

  const groundGeo = new THREE.PlaneGeometry(10, 5000);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  world = new CANNON.World();
  physicsMaterial = new CANNON.Material("physics");

  const contactMaterial = new CANNON.ContactMaterial(
    physicsMaterial,
    physicsMaterial,
    {
      friction: 0.2,      // 摩擦力（可調整）
      restitution: 2    // 彈性（可調整）
    }
  );
  const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(5, 0.05, 2500)),  // 對應 Plane 的大小
    material: physicsMaterial
  });
  groundBody.position.set(0, 0, 0);  // 不需要再旋轉或偏移
  world.addBody(groundBody);
  world.gravity.set(0, -9.82, 0);

  // Dynamic Crosshair
  crosshair = document.createElement('div');
  crosshair.style.position = 'absolute';
  crosshair.style.width = '10px';
  crosshair.style.height = '10px';
  crosshair.style.background = '#fff';
  crosshair.style.borderRadius = '50%';
  crosshair.style.pointerEvents = 'none';
  crosshair.style.zIndex = '99';
  document.body.appendChild(crosshair);

  window.addEventListener("mousemove", (e) => {
    crosshair.style.left = `${e.clientX - 5}px`;
    crosshair.style.top = `${e.clientY - 5}px`;
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && gameStarted && !isGameOver) {
      togglePause();
    }
  });

  window.addEventListener("click", (e) => {
    // 如果點的是按鈕或 UI，則不射擊
    if (
      e.target.tagName === "BUTTON" || 
      e.target.closest("#menu") || 
      e.target.closest("#restart-menu")
    ) {
      return;
    }

    if (gameStarted && !isGameOver) shoot(e);
  });

  document.getElementById("restart-button").onclick = () => {
      resetGame(); // 改為重設，不再 reload
    };

    document.getElementById("mute-button").onclick = () => {
    isMuted = !isMuted;
    bgm.muted = isMuted;
    soundHit.muted = isMuted;
    soundCrystal.muted = isMuted;
    soundShoot.muted = isMuted;

    document.getElementById("mute-button").textContent = isMuted ? "🔇" : "🔊";
  };
  updateLeaderboard();
}

function spawnRandomTarget() {
  if (!gameStarted || isGameOver) return;

  const z = camera.position.z - 30;
  const x = (Math.random() - 0.5) * 3;
  const y = 1.5;
  const isGlass = Math.random() < glassChance;
  const L = LEVELS[currentLevelIndex]; // ⭐ 新增
  const isMovingGlass = isGlass && Math.random() < L.movingGlassChance; // ⭐ 由關卡控制

  if (isGlass) {
    const size = 0.6;
    const glassGeo = new THREE.BoxGeometry(size, size, 0.1);
    const glassMat = new THREE.MeshStandardMaterial({
      color: isMovingGlass ? 0xff8888 : 0x88ffff,  // 紅色代表會動的玻璃
      transparent: true,
      opacity: 0.7
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(x, y, z);
    scene.add(glass);

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size/2, size/2, 0.05)));
    body.position.set(x, y, z);
    world.addBody(body);

    glassBlocks.push({
      mesh: glass,
      body,
      isMoving: isMovingGlass,
      moveOffset: Math.random() * Math.PI * 2, // 起始相位
      moveAmplitude: 1 + Math.random(),       // 振幅 1~2
      moveSpeed: 1 + Math.random() * 2        // 速度 1~3
    });
  } else {
    // 🎯 新增稀有水晶機率
    const rand = Math.random();
    let crystalColor, bonusType;

    if (rand < 0.7) {
      crystalColor = 0x44ccff; // 藍色：+3球
      bonusType = "blue";
    } else if (rand < 0.9) {
      crystalColor = 0x00ff00; // 綠色：+5球
      bonusType = "green";
    } else {
      crystalColor = 0xcc44ff; // 紫色：+1分+1球
      bonusType = "purple";
    }

    const crystalGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
    const crystalMat = new THREE.MeshStandardMaterial({ color: crystalColor });
    crystalMat.emissive = new THREE.Color(crystalColor); // 發光效果
    crystalMat.emissiveIntensity = 0.5;
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(x, y, z);
    scene.add(crystal);

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Sphere(0.2));
    body.position.set(x, y, z);
    world.addBody(body);

    crystals.push({ mesh: crystal, body, collected: false, bonusType });
  }
}


function shoot(event) {
  if (ballCount <= 0) {
    endGame();
    return;
  }

  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const shootDir = raycaster.ray.direction.clone();

  shootDir.normalize();

  const radius = 0.07;
  const ballGeo = new THREE.SphereGeometry(radius, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x888888,
    emissiveIntensity: 0.2
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.copy(camera.position);
  scene.add(ball);

  const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(radius), material: physicsMaterial });
  body.position.copy(camera.position);
  const force = 25;
  body.velocity.set(shootDir.x * force, shootDir.y * (force+5), shootDir.z * force);
  world.addBody(body);

  shootBalls.push({ mesh: ball, body, hasHitGlass: false, lastGhostPos: ball.position.clone(), hitGate: false, isDebris: false });

  soundShoot.currentTime = 0;
  soundShoot.play();
  ballCount--;
  document.getElementById('ball-count').textContent = ballCount;
}

function showFloatingScore(position3D, text = "+1") {
  const vector = position3D.clone().project(camera);
  const x = (vector.x + 1) / 2 * window.innerWidth;
  const y = (-vector.y + 1) / 2 * window.innerHeight;

  const div = document.createElement("div");
  div.className = "score-float";
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  div.textContent = text;

  document.body.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 800);
}


function explodeGlass(position) {
  const fragCount = 8;  // 增加碎片數量

  for (let i = 0; i < fragCount; i++) {
    // ✅ 小碎片、不規則形狀
    const w = Math.random() * 0.1 + 0.05;
    const h = Math.random() * 0.1 + 0.05;
    const d = Math.random() * 0.01 + 0.005;

    const fragGeo = new THREE.BoxGeometry(w, h, d);
    const fragMat = new THREE.MeshStandardMaterial({
      color: 0x88ffff,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      metalness: 0.3,
      emissive: new THREE.Color(0x88ffff),
      emissiveIntensity: 0.1
    });

    const frag = new THREE.Mesh(fragGeo, fragMat);

    // ✅ 加一些位移偏移讓更自然
    frag.position.set(
      position.x + (Math.random() - 0.5) * 0.3,
      position.y + (Math.random() - 0.5) * 0.3,
      position.z + (Math.random() - 0.5) * 0.3
    );

    frag.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    scene.add(frag);

    const fragBody = new CANNON.Body({ mass: 0.05 }); // 輕一點，像玻璃片
    fragBody.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
    fragBody.position.copy(frag.position);
    fragBody.velocity.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.2) * 4 + 2,  // 稍微往上噴
      (Math.random() - 0.5) * 6
    );

    // ✅ 增加旋轉
    fragBody.angularVelocity.set(
      Math.random() * 10 - 5,
      Math.random() * 10 - 5,
      Math.random() * 10 - 5
    );

    world.addBody(fragBody);

    // ❗ 讓碎片跟著物理位置更新
    const fragObj = { mesh: frag, body: fragBody, createdAt: Date.now(), isDebris: true, hitGate: true };
    shootBalls.push(fragObj);  // 加入 shootBalls 以自動更新位置（但不要檢查碰撞）
  }

  soundHit.currentTime = 0;
  soundHit.play();
  showFloatingScore(position);
}

function moveWorldForward(speed) {
  if (!isTransitioningLevel) {
    // 正常推進
    glassBlocks.forEach(g => {
      g.mesh.position.z += speed;
      g.body.position.z += speed;
    });
    crystals.forEach(c => {
      c.mesh.position.z += speed;
      c.body.position.z += speed;
    });
    shootBalls.forEach(b => {
      b.mesh.position.z += speed;
      b.body.position.z += speed;
    });
  } else {
    // 轉場：厚玻璃照常往前，球照常飛
    if (transitionGlass) {
      const gateZ = transitionGlass.mesh.position.z;
      transitionGlass.mesh.position.z += speed;
      transitionGlass.body.position.z += speed;

      // 只有「在厚玻璃前面」的物件繼續往前；後面的先暫停
      glassBlocks.forEach(g => {
        if (g.mesh.position.z > gateZ) {
          g.mesh.position.z += speed;
          g.body.position.z += speed;
        }
      });
      crystals.forEach(c => {
        if (c.mesh.position.z > gateZ) {
          c.mesh.position.z += speed;
          c.body.position.z += speed;
        }
      });
    }

    shootBalls.forEach(b => {
      b.mesh.position.z += speed;
      b.body.position.z += speed;
    });
  }
}


function cleanupBehindCamera() {
  const camZ = camera.position.z;
  glassBlocks = glassBlocks.filter(g => {
    if (g.mesh.position.z > camZ + 10) {
      scene.remove(g.mesh);
      world.removeBody(g.body);
      return false;
    }
    return true;
  });
  crystals = crystals.filter(c => {
    if (c.mesh.position.z > camZ + 10) {
      scene.remove(c.mesh);
      world.removeBody(c.body);
      return false;
    }
    return true;
  });
}

async function endGame() {
  isGameOver = true;
  bgm.pause(); // 停止播放
  document.getElementById("restart-menu").style.display = "flex";
  await submitScore();      // 📝 加入自己分數
  await loadLeaderboard();  // 📖 顯示更新後榜單
}

function animate() {
  if (!gameStarted || isGameOver || isPaused) return;

  // ⭐ 新增：時間到就升關（可改成用分數、距離等條件）
  const elapsed = (Date.now() - levelStartTime) / 1000;
  if (currentLevelIndex < LEVELS.length - 1) {
    const need = LEVEL_DURATIONS[currentLevelIndex] || 999999;
    if (elapsed >= need && !isTransitioningLevel) {
      startLevelTransition();
    }
  }

  requestAnimationFrame(animate);
  world.step(1 / 60);

  const now = Date.now();
  if (now - lastSpeedIncreaseTime > 10000) {
    speedMultiplier += 0.12;
    lastSpeedIncreaseTime = now;
  }
  
  const timeSec = Date.now() * 0.001;  // 以秒為單位

  glassBlocks.forEach(g => {
    if (g.isMoving) {
      const offsetX = Math.sin(timeSec * g.moveSpeed + g.moveOffset) * g.moveAmplitude;
      g.mesh.position.x = offsetX;
      g.body.position.x = offsetX;
    }
  });

  const worldStep = 0.05 * speedMultiplier;   // ← 唯一的世界速度來源
  moveWorldForward(worldStep);
  
  speedLines.forEach(line => {
    line.position.z += 2 * speedMultiplier;

    // 如果超過 camera.z（飛過玩家），重設到遠方
    if (line.position.z > camera.position.z) {
      line.position.x = (Math.random() - 0.5) * 200;
      line.position.y = (Math.random() - 0.5) * 200;
      line.position.z = -500;
    }
  });

  shootBalls.forEach((ball) => {
    const { mesh, body, hasHitGlass } = ball;

    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);

    if (ball.lastGhostPos) {
      const dist = mesh.position.distanceTo(ball.lastGhostPos);
      if (dist > 0.5) {  // 每移動超過 0.7 才畫一次殘影
        const ghostGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const ghostMat = new THREE.MeshStandardMaterial({
          color: 0x44ccff,
          transparent: true,
          opacity: 0.5,
          emissive: 0x44ccff,
          emissiveIntensity: 0.6
        });
        const ghost = new THREE.Mesh(ghostGeo, ghostMat);
        ghost.position.copy(body.position);
        scene.add(ghost);
        ballGhosts.push({ mesh: ghost, createdAt: Date.now() });
        ball.lastGhostPos.copy(mesh.position);  // 更新位置
      }
    }
  });

  shootBalls.forEach((ball) => {
    const { mesh, body, hasHitGlass } = ball;

    if (isTransitioningLevel && transitionGlass && !ball.isDebris) {
      const { width, height, thickness } = transitionGlass.dims;  // ← 取尺寸
      const gatePos = transitionGlass.mesh.position;
      const radius = 0.07; // 你的球半徑

      const dx = Math.abs(mesh.position.x - gatePos.x);
      const dy = Math.abs(mesh.position.y - gatePos.y);
      const dz = Math.abs(mesh.position.z - gatePos.z);

      // ⭐ 粗略的「盒子 vs 球」碰撞：落在厚玻璃包圍盒就算打到
      if (dx <= width/2 + radius && dy <= height/2 + radius && dz <= thickness/2 + radius && !ball.hitGate) {
        ball.hitGate = true;
        transitionGlassHP--;

        // 小碎屑（從命中點噴）
        gateChipBurstAt(mesh.position, 0xffcc33);

        // 以厚玻璃局部座標計算裂紋 UV(0~1)
        const local = transitionGlass.mesh.worldToLocal(mesh.position.clone());
        const u = THREE.MathUtils.clamp(local.x / width + 0.5, 0, 1);
        const v = THREE.MathUtils.clamp(local.y / height + 0.5, 0, 1);

        // 畫程序裂紋並更新材質
        drawCrackAt(transitionGlass.crack, u, v);
        transitionGlass.crack.tex.needsUpdate = true;

        // 受擊視覺 & 音效（保留你原本效果）
        const mat = transitionGlass.mesh.material;
        mat.opacity = Math.max(0.4, mat.opacity - 0.2);
        const prevEm = mat.emissiveIntensity ?? 0;
        mat.emissiveIntensity = 0.9;
        setTimeout(() => { mat.emissiveIntensity = prevEm; }, 120);

        camShakeUntil = Date.now() + 150;
        flashWhite(120);
        showGateHitsLeft(transitionGlassHP);

        soundHit.currentTime = 0;
        soundHit.play();

        if (transitionGlassHP <= 0) {
          explodeGateGlass(transitionGlass.mesh.position, 0xffcc33);
          scene.remove(transitionGlass.mesh);
          world.removeBody(transitionGlass.body);
          transitionGlass = null;
          if (gateHitsOverlay) { gateHitsOverlay.remove(); gateHitsOverlay = null; }
          setTimeout(() => { isTransitioningLevel = false; levelUp(); }, 500);
        }
      }
    }

    // 撞玻璃
    glassBlocks.forEach((g, j) => {
      const dist = mesh.position.distanceTo(g.mesh.position);
      if (dist < 0.5) {
        scene.remove(g.mesh);
        world.removeBody(g.body);
        glassBlocks.splice(j, 1);

        explodeGlass(g.mesh.position);

        const gain = g.isMoving ? 5 : 1;
        score += gain;
        document.getElementById("score").textContent = score;

        soundHit.currentTime = 0;
        soundHit.play();
        showFloatingScore(g.mesh.position, `+${gain}`);
      }
    });

    // 撞水晶（原本程式的）
    crystals.forEach((c) => {
      if (c.collected) return;
      const dist = mesh.position.distanceTo(c.mesh.position);
      if (dist < 0.4) {
        soundCrystal.currentTime = 0;
        soundCrystal.play();
        showCrystalHitEffect(c.mesh.position, c.mesh.material.color.getHex());
        scene.remove(c.mesh);
        world.removeBody(c.body);
        c.collected = true;

        if (c.bonusType === "blue") {
          ballCount += 2;
          showFloatingScore(c.mesh.position, "+2 Balls");
        } else if (c.bonusType === "green") {
          ballCount += 4;
          showFloatingScore(c.mesh.position, "+4 Balls");
        } else if (c.bonusType === "purple") {
          ballCount += 10;
          score += 1;
          showFloatingScore(c.mesh.position, "+10 Ball +1 Score");
          document.getElementById("score").textContent = score;
        }

        document.getElementById("ball-count").textContent = ballCount;
      }
    });
  });

  // 更新殘影
  ballGhosts.forEach((ghost, i) => {
    const age = Date.now() - ghost.createdAt;
    const life = 600; // 存活 600ms

    if (age > life) {
      scene.remove(ghost.mesh);
      ballGhosts.splice(i, 1);
    } else {
      const t = age / life;
      ghost.mesh.material.opacity = 1 - t;
      ghost.mesh.scale.setScalar(1 - t);
    }
  });

  // 🔥 檢查玻璃是否撞到玩家相機位置，觸發 Game Over
  glassBlocks.forEach((g) => {
    const dist = g.mesh.position.distanceTo(camera.position);
    if (dist < 0.4) {
      endGame();
    }
  });

  // 🚗 真實速度：根據 speedMultiplier 轉換為 km/h
  const actualSpeedKmh = speedMultiplier * 20;  // 1x = 10.8 km/h

  // 平滑地趨近實際速度（動畫效果）
  currentSpeedDisplay += (actualSpeedKmh - currentSpeedDisplay) * 0.25;  // 0.1 控制平滑程度

  // 顯示在畫面上
  document.getElementById("speed-display").textContent =
    `🚗 Speed: ${currentSpeedDisplay.toFixed(1)} km/h`;
  // 厚玻璃靠太近（撞到玩家）→ Game Over
  if (isTransitioningLevel && transitionGlass) {
    const d = transitionGlass.mesh.position.distanceTo(camera.position);
    if (d < 0.6) endGame();
  }
  // Camera shake
  if (Date.now() < camShakeUntil) {
    const t = (camShakeUntil - Date.now()) / 150; // 0~1
    const amp = 0.03 * t;                         // 震幅
    camera.position.x = camBase.x + (Math.random() - 0.5) * amp;
    camera.position.y = camBase.y + (Math.random() - 0.5) * amp;
  } else {
    camera.position.copy(camBase);
  }

  cleanupShootBalls();
  cleanupBehindCamera();
  renderer.render(scene, camera);
}

function resetGame() {
  if (spawnInterval) clearInterval(spawnInterval);
  // 清除場上所有物件
  shootBalls.forEach(b => {
    scene.remove(b.mesh);
    world.removeBody(b.body);
  });
  glassBlocks.forEach(g => {
    scene.remove(g.mesh);
    world.removeBody(g.body);
  });
  crystals.forEach(c => {
    scene.remove(c.mesh);
    world.removeBody(c.body);
  });

  shootBalls.length = 0;
  glassBlocks.length = 0;
  crystals.length = 0;

  // 重設變數
  ballCount = 20;
  score = 0;
  speedMultiplier = 1;
  lastSpeedIncreaseTime = Date.now();
  isGameOver = false;

  document.getElementById("ball-count").textContent = ballCount;
  document.getElementById("score").textContent = score;

  // 隱藏 restart 畫面
  document.getElementById("restart-menu").style.display = "none";

  // 重設相機位置
  camera.position.set(0, 1.5, 5);

  // 重新啟動遊戲
  currentLevelIndex = 0;      // 新增
  levelStartTime = Date.now(); // 新增
  gameStarted = true;
  bgm.currentTime = 0;
  bgm.play(); // 重新開始時播放音樂
  applyLevelConfig(); // ⭐ 由關卡決定 spawn 間隔與玻璃機率
  animate();
}


async function submitScore() {
  const scoresRef = db.collection("scores");

  // 查詢是否已有相同名字紀錄
  const snapshot = await scoresRef.where("name", "==", playerName).get();

  if (!snapshot.empty) {
    // 有紀錄，抓出最高的舊分數
    const existing = snapshot.docs[0];
    const oldScore = existing.data().score;

    if (score <= oldScore) {
      // 新分數比較低，不更新
      console.log("新分數比舊分數低，不更新排行榜。");
      return;
    } else {
      // 新分數比較高，刪掉舊紀錄再新增
      await scoresRef.doc(existing.id).delete();
    }
  }

  // 新增高分記錄
  await scoresRef.add({
    name: playerName,
    score: score,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function loadLeaderboard() {
  const scoresRef = db.collection("scores");
  const snapshot = await scoresRef.orderBy("score", "desc").limit(5).get();
  const top5 = snapshot.docs.map(doc => doc.data());

  const container = document.getElementById("leaderboard");
  container.innerHTML = `<h3>🏆 記分板</h3>` + top5.map((e, i) =>
    `${i+1}. ${e.name} - ${e.score}`
  ).join("<br>");
}

function createSpeedLines() {
  const material = new THREE.LineBasicMaterial({ color: 0xffffff });

  for (let i = 0; i < 200; i++) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 5), // 長度 5
    ]);

    const line = new THREE.Line(geometry, material);

    // 隨機位置，圍繞玩家視野分佈
    line.position.x = (Math.random() - 0.5) * 200;
    line.position.y = (Math.random() - 0.5) * 200;
    line.position.z = Math.random() * -500;

    scene.add(line);
    speedLines.push(line);
  }
}

function showCrystalHitEffect(position, colorHex = 0x00ffff) {
  // 💫 光圈（爆閃縮放後淡出）
  const ringGeo = new THREE.RingGeometry(0.1, 0.3, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(position);
  ring.lookAt(camera.position);
  scene.add(ring);

  const startTime = Date.now();
  const duration = 500;

  const animateRing = () => {
    const t = (Date.now() - startTime) / duration;
    if (t > 1) {
      scene.remove(ring);
      return;
    }
    ring.scale.setScalar(1 + t * 2);
    ring.material.opacity = 0.8 * (1 - t);
    requestAnimationFrame(animateRing);
  };
  animateRing();

  // 🧩 粒子爆炸
  for (let i = 0; i < 15; i++) {
    const dotGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1.0
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(position);
    scene.add(dot);

    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    const start = Date.now();
    const life = 600;

    const animateDot = () => {
      const t = (Date.now() - start) / life;
      if (t > 1) {
        scene.remove(dot);
        return;
      }
      dot.position.addScaledVector(dir, 0.05);
      dot.material.opacity = 1 - t;
      requestAnimationFrame(animateDot);
    };
    animateDot();
  }
}


function cleanupShootBalls() {
  const camZ = camera.position.z;

  for (let i = shootBalls.length - 1; i >= 0; i--) {
    const b = shootBalls[i];
    const pos = b.mesh.position;
    const tooFar = pos.z > camZ + 30 || pos.z < camZ - 150;
    const tooLow = pos.y < -15;

    let tooOld = false;
    if (b.createdAt !== undefined) {
      tooOld = Date.now() - b.createdAt > 2500; // 玻璃碎片壽命 2.5 秒
    }

    if (tooFar || tooLow || tooOld) {
      scene.remove(b.mesh);
      world.removeBody(b.body);
      shootBalls.splice(i, 1);
    }
  }
}

function togglePause() {
  isPaused = !isPaused;

  if (isPaused) {
    // 停止生成目標
    if (spawnInterval) {
      clearInterval(spawnInterval);
      spawnInterval = null;
    }

    // 顯示暫停圖示
    pauseOverlay = document.createElement("div");
    pauseOverlay.id = "pause-overlay";
    pauseOverlay.textContent = "⏸ 暫停";
    document.body.appendChild(pauseOverlay);

  } else {
    // 恢復生成目標
    if (!spawnInterval) {
      spawnInterval = setInterval(spawnRandomTarget, 800);
    }

    // 移除 overlay
    if (pauseOverlay) {
      pauseOverlay.remove();
      pauseOverlay = null;
    }

    animate(); // 繼續遊戲
  }
}

// ⭐ 新增：套用目前關卡的參數（含 spawn 節奏）
function applyLevelConfig() {
  const L = LEVELS[currentLevelIndex];
  glassChance = L.glassChance; // 與現有變數沿用
  if (spawnInterval) clearInterval(spawnInterval);
  spawnInterval = setInterval(spawnRandomTarget, L.spawnIntervalMs);
  showLevelBanner(L.name);
  levelStartTime = Date.now(); // 進入每一關時都重設計時
}

// ⭐ 新增：升到下一關
function levelUp() {
  if (currentLevelIndex >= LEVELS.length - 1) return; // 已到最後一關就不升
  currentLevelIndex++;
  applyLevelConfig();
  levelStartTime = Date.now();
}

// ⭐ 新增：畫面中央彈一個關卡提示
function showLevelBanner(text) {
  const old = document.getElementById("level-banner");
  if (old) old.remove();
  const div = document.createElement("div");
  div.id = "level-banner"; // 固定 ID，方便下次移除
  div.textContent = text;
  div.style.position = "absolute";
  div.style.top = "40%";
  div.style.left = "50%";
  div.style.transform = "translate(-50%,-50%)";
  div.style.padding = "16px 28px";
  div.style.borderRadius = "16px";
  div.style.background = "rgba(0,0,0,0.6)";
  div.style.color = "white";
  div.style.fontSize = "40px";
  div.style.fontWeight = "bold";
  div.style.zIndex = "120";
  div.style.pointerEvents = "none";
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = "opacity .5s";
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 500);
  }, 1200);
}

function startLevelTransition() {
  isTransitioningLevel = true;

  // 停止「之後」的生成（不再刷新的）
  if (spawnInterval) {
    clearInterval(spawnInterval);
    spawnInterval = null;
  }

  // 🔹 找出目前場上「最遠」的 z（數值最小）
  let farthestZ = camera.position.z - 30; // 預設與一般生成相同
  glassBlocks.forEach(g => { if (g.mesh.position.z < farthestZ) farthestZ = g.mesh.position.z; });
  crystals.forEach(c => { if (c.mesh.position.z < farthestZ) farthestZ = c.mesh.position.z; });

  // 厚玻璃放在「更遠一點」的位置，確保在所有障礙之後
  const z = farthestZ - 20;   // 你可調整這個額外距離

  // 保險：別比「一般生成距離 -30」還近
  const spawnZ = camera.position.z - 30;
  const finalZ = Math.min(z, spawnZ - 1);   // 至少比一般生成再遠 1

  const width = 8, height = 5, thickness = 0.6;

  const glassGeo = new THREE.BoxGeometry(width, height, thickness);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffcc33,
    emissive: 0x553300,
    emissiveIntensity: 0.25,
    transparent: true,   // ✅ 要讓 opacity 生效
    opacity: 0.95,
    roughness: 0.15,
    metalness: 0.1
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 3, finalZ);
  scene.add(glass);

  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(width/2, height/2, thickness/2)));
  body.position.set(0, 1.5, finalZ);
  world.addBody(body);

  transitionGlass = { mesh: glass, body };

  // === 裂紋層：用 CanvasTexture 疊在厚玻璃表面 ===
  const crackCanvas = document.createElement('canvas');
  crackCanvas.width = 1024;  // 解析度高一點，裂紋更細
  crackCanvas.height = 1024;
  const crackCtx = crackCanvas.getContext('2d');
  crackCtx.clearRect(0, 0, crackCanvas.width, crackCanvas.height);

  const crackTex = new THREE.CanvasTexture(crackCanvas);
  crackTex.wrapS = crackTex.wrapT = THREE.ClampToEdgeWrapping;

  const crackGeo = new THREE.PlaneGeometry(width, height);
  const crackMat = new THREE.MeshBasicMaterial({
    map: crackTex,
    transparent: true,
    depthTest: true
  });
  const crackMesh = new THREE.Mesh(crackGeo, crackMat);

  // 往前一點，避免與厚玻璃 Z-fighting
  crackMesh.position.z += thickness / 2 + 0.001;
  glass.add(crackMesh);

  // ⭐ 把尺寸帶出來
  transitionGlass = {
    mesh: glass,
    body,
    dims: { width, height, thickness },   // ← 關鍵：之後 animate 才能用
    crack: { canvas: crackCanvas, ctx: crackCtx, tex: crackTex, mesh: crackMesh },
  };
  transitionGlassHP = 3;
}

function flashWhite(ms = 120) {
  let el = document.getElementById("hit-flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "hit-flash";
    el.style.position = "fixed";
    el.style.left = "0";
    el.style.top = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.background = "rgba(255,255,255,0.35)";
    el.style.pointerEvents = "none";
    el.style.zIndex = "150";
    el.style.opacity = "0";
    el.style.transition = "opacity 80ms";
    document.body.appendChild(el);
  }
  el.style.opacity = "1";
  setTimeout(() => {
    el.style.opacity = "0";
  }, ms);
}

function showGateHitsLeft(hp) {
  if (!gateHitsOverlay) {
    gateHitsOverlay = document.createElement("div");
    gateHitsOverlay.id = "gate-hits-left";
    gateHitsOverlay.style.position = "fixed";
    gateHitsOverlay.style.top = "12%";
    gateHitsOverlay.style.left = "50%";
    gateHitsOverlay.style.transform = "translateX(-50%)";
    gateHitsOverlay.style.padding = "10px 16px";
    gateHitsOverlay.style.borderRadius = "12px";
    gateHitsOverlay.style.background = "rgba(0,0,0,0.55)";
    gateHitsOverlay.style.color = "#ffd24d";
    gateHitsOverlay.style.fontSize = "22px";
    gateHitsOverlay.style.fontWeight = "700";
    gateHitsOverlay.style.zIndex = "140";
    gateHitsOverlay.style.pointerEvents = "none";
    document.body.appendChild(gateHitsOverlay);
  }
  gateHitsOverlay.textContent = `還需 ${hp} 下`;
  gateHitsOverlay.style.scale = "1.15";
  gateHitsOverlay.style.transition = "scale 120ms ease-out";
  requestAnimationFrame(() => { gateHitsOverlay.style.scale = "1"; });
}

function drawCrackAt(crack, u, v) {
  const { canvas, ctx } = crack;
  const cx = u * canvas.width;
  const cy = (1 - v) * canvas.height; // UV 的 v 往上是 1

  // 基本樣式：白色細線，邊緣帶一點半透明暈開
  const mainColor = 'rgba(255,255,255,0.95)';
  const glowColor = 'rgba(255,255,255,0.25)';

  // 先畫一個淡淡的衝擊圈
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 8;
  ctx.stroke();

  // 裂紋參數
  const branches = 9 + Math.floor(Math.random() * 4);  // 9~12 支主裂
  const lenMin = 120, lenMax = 240;                    // 主裂長度
  const jitter = 16;                                   // 抖動幅度
  const segments = 18;                                 // 每支主裂分段

  for (let i = 0; i < branches; i++) {
    const baseAngle = (Math.PI * 2 * i) / branches + Math.random() * 0.25;
    let x = cx, y = cy;

    // 主裂光暈（粗一點）
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < segments; s++) {
      const prog = s / segments;
      const segLen = THREE.MathUtils.lerp(lenMin, lenMax, Math.random());
      const ang = baseAngle + (Math.random() - 0.5) * 0.5; // 每段微偏
      x += Math.cos(ang) * (segLen / segments) + (Math.random() - 0.5) * jitter;
      y += Math.sin(ang) * (segLen / segments) + (Math.random() - 0.5) * jitter;
      ctx.lineTo(x, y);

      // 偶爾生出支線
      if (Math.random() < 0.12 && s > 3) {
        drawCrackBranch(ctx, x, y, ang + (Math.random() - 0.5) * 1.2, segLen * 0.45, jitter * 0.65);
      }
    }
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 5;
    ctx.stroke();

    // 主裂中間的細亮線
    x = cx; y = cy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < segments; s++) {
      const segLen = THREE.MathUtils.lerp(lenMin, lenMax, Math.random());
      const ang = baseAngle + (Math.random() - 0.5) * 0.35;
      x += Math.cos(ang) * (segLen / segments) + (Math.random() - 0.5) * (jitter * 0.5);
      y += Math.sin(ang) * (segLen / segments) + (Math.random() - 0.5) * (jitter * 0.5);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function drawCrackBranch(ctx, sx, sy, angle, length, jitter) {
  const segs = 10;
  let x = sx, y = sy;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < segs; i++) {
    const ang = angle + (Math.random() - 0.5) * 0.6;
    x += Math.cos(ang) * (length / segs) + (Math.random() - 0.5) * jitter;
    y += Math.sin(ang) * (length / segs) + (Math.random() - 0.5) * jitter;
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function gateChipBurstAt(position, color = 0xffcc33) {
  const count = 12;                      // 小碎屑數
  for (let i = 0; i < count; i++) {
    const w = Math.random() * 0.06 + 0.03;
    const h = Math.random() * 0.06 + 0.03;
    const d = Math.random() * 0.01 + 0.005;

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.08
    });

    const chip = new THREE.Mesh(geo, mat);
    chip.position.copy(position);
    chip.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    scene.add(chip);

    const body = new CANNON.Body({ mass: 0.02 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
    body.position.copy(position);
    // 往外噴
    body.velocity.set(
      (Math.random()-0.5)*3,
      Math.random()*2 + 0.5,
      (Math.random()-0.5)*3
    );
    body.angularVelocity.set(Math.random()*6-3, Math.random()*6-3, Math.random()*6-3);
    world.addBody(body);

    // ✅ 標記為碎片，避免誤判打到厚玻璃
    shootBalls.push({
      mesh: chip, body,
      createdAt: Date.now(),
      isDebris: true,
      hitGate: true
    });
  }
}
function explodeGateGlass(position, color = 0xffcc33) {
  const bigCount = 20; // 大碎片數
  for (let i = 0; i < bigCount; i++) {
    const w = Math.random() * 0.25 + 0.08;
    const h = Math.random() * 0.25 + 0.08;
    const d = Math.random() * 0.05 + 0.02;

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      roughness: 0.2,
      metalness: 0.15,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.12
    });

    const frag = new THREE.Mesh(geo, mat);
    frag.position.set(
      position.x + (Math.random() - 0.5) * 0.4,
      position.y + (Math.random() - 0.5) * 0.4,
      position.z + (Math.random() - 0.5) * 0.1
    );
    frag.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(frag);

    const body = new CANNON.Body({ mass: 0.08 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.copy(frag.position);

    // ★ 改成跟普通玻璃一樣的全方向隨機速度
    body.velocity.set(
      (Math.random() - 0.5) * 10,  // X 方向
      (Math.random() - 0.5) * 10,  // Y 方向
      (Math.random() - 0.5) * 10   // Z 方向
    );

    body.angularVelocity.set(
      Math.random() * 10 - 5,
      Math.random() * 10 - 5,
      Math.random() * 10 - 5
    );

    world.addBody(body);

    shootBalls.push({
      mesh: frag, body,
      createdAt: Date.now(),
      isDebris: true,
      hitGate: true
    });
  }

  // 可選：補幾個普通玻璃碎片
  if (typeof explodeGlass === 'function') explodeGlass(position);
}
