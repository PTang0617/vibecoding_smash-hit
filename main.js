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
    playerName = input;
    gameStarted = true;

    // 顯示「按下空白鍵可暫停」提示
    const hint = document.getElementById("center-hint");
    hint.classList.add("show");

    setTimeout(() => {
      hint.classList.remove("show");
    }, 2000);

    bgm.play();
    animate();
    spawnInterval = setInterval(spawnRandomTarget, 800);
    loadLeaderboard();
    createSpeedLines();
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
  const isMovingGlass = isGlass && speedMultiplier > 1.5 && Math.random() < 0.2; // 速度大於 2 且有 30% 機率是會移動的

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

  shootBalls.push({ mesh: ball, body, hasHitGlass: false, lastGhostPos: ball.position.clone() });

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
    const fragObj = { mesh: frag, body: fragBody, createdAt: Date.now() };
    shootBalls.push(fragObj);  // 加入 shootBalls 以自動更新位置（但不要檢查碰撞）
  }

  soundHit.currentTime = 0;
  soundHit.play();
  showFloatingScore(position);
}



function moveWorldForward(speed) {
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

  requestAnimationFrame(animate);
  world.step(1 / 60);

  const now = Date.now();
  if (now - lastSpeedIncreaseTime > 10000) {
    speedMultiplier += 0.12;
    glassChance = Math.min(glassChance + 0.05, 0.8);  // 每次增加 5%，最多到 1.0（100%）
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

  moveWorldForward(0.05 * speedMultiplier);
  
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
  glassChance = 0.7;
  isGameOver = false;

  document.getElementById("ball-count").textContent = ballCount;
  document.getElementById("score").textContent = score;

  // 隱藏 restart 畫面
  document.getElementById("restart-menu").style.display = "none";

  // 重設相機位置
  camera.position.set(0, 1.5, 5);

  // 重新啟動遊戲
  gameStarted = true;
  bgm.currentTime = 0;
  bgm.play(); // 重新開始時播放音樂
  spawnInterval = setInterval(spawnRandomTarget, 800);
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
    // 顯示暫停圖示
    pauseOverlay = document.createElement("div");
    pauseOverlay.id = "pause-overlay";
    pauseOverlay.textContent = "⏸ 暫停";
    document.body.appendChild(pauseOverlay);
  } else {
    // 恢復遊戲，移除 overlay
    if (pauseOverlay) {
      pauseOverlay.remove();
      pauseOverlay = null;
    }
    animate();  // 繼續執行 requestAnimationFrame
  }
}