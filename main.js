// Smash Hit Web - Game Over on Glass Collision

let scene, camera, renderer, world;
let ballCount = 20;
let score = 0;
let isGameOver = false;
let gameStarted = false;
const shootBalls = [];
let glassBlocks = [];
let crystals = [];
let crosshair;
let speedMultiplier = 1;
let lastSpeedIncreaseTime = Date.now();
let playerName = "匿名";
const soundHit = new Audio("hit.mp3");
const soundCrystal = new Audio("crystal.mp3");
const soundShoot = new Audio("shoot.mp3");
let isMuted = false;
const bgm = new Audio("bgm.mp3");
bgm.loop = true; // 讓音樂循環播放
bgm.volume = 0.4; // 可調整音量（0 ~ 1）

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
  document.getElementById("start-button").onclick = () => {
    document.getElementById("menu").style.display = "none";
    gameStarted = true;
    playerName = document.getElementById("player-name-input").value.trim() || "匿名";
    bgm.play();
    animate();
    setInterval(spawnRandomTarget, 800);
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
}

function spawnRandomTarget() {
  if (!gameStarted || isGameOver) return;

  const z = camera.position.z - 30;
  const x = (Math.random() - 0.5) * 3;
  const y = 1.5;
  const isGlass = Math.random() < 0.7;

  if (isGlass) {
    const size = 0.6;
    const glassGeo = new THREE.BoxGeometry(size, size, 0.1);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ffff, transparent: true, opacity: 0.7 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(x, y, z);
    scene.add(glass);

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size/2, size/2, 0.05)));
    body.position.set(x, y, z);
    world.addBody(body);

    glassBlocks.push({ mesh: glass, body });
  } else {
    const crystalGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x44ccff });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(x, y, z);
    scene.add(crystal);

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Sphere(0.2));
    body.position.set(x, y, z);
    world.addBody(body);

    crystals.push({ mesh: crystal, body, collected: false });
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

  const radius = 0.1;
  const ballGeo = new THREE.SphereGeometry(radius, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.copy(camera.position);
  scene.add(ball);

  const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(radius) });
  body.position.copy(camera.position);
  body.velocity.set(shootDir.x * 15, shootDir.y * 15, shootDir.z * 15);
  world.addBody(body);

  shootBalls.push({ mesh: ball, body });

  soundShoot.currentTime = 0;
  soundShoot.play();
  ballCount--;
  document.getElementById('ball-count').textContent = ballCount;
}

function explodeGlass(position) {
  for (let i = 0; i < 6; i++) {
    const fragGeo = new THREE.BoxGeometry(0.15, 0.15, 0.02);
    const fragMat = new THREE.MeshStandardMaterial({ color: 0x88ffff, transparent: true, opacity: 0.8 });
    const frag = new THREE.Mesh(fragGeo, fragMat);
    frag.position.copy(position);
    scene.add(frag);

    const fragBody = new CANNON.Body({ mass: 0.1 });
    fragBody.addShape(new CANNON.Box(new CANNON.Vec3(0.075, 0.075, 0.01)));
    fragBody.position.copy(position);
    fragBody.velocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    );
    world.addBody(fragBody);

    shootBalls.push({ mesh: frag, body: fragBody });

    setTimeout(() => {
      scene.remove(frag);
      world.removeBody(fragBody);
    }, 2000);
  }
  soundHit.currentTime = 0;
  soundHit.play();
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

function endGame() {
  isGameOver = true;
  bgm.pause(); // 停止播放
  document.getElementById("restart-menu").style.display = "flex";
  updateLeaderboard();
}

function animate() {
  if (!gameStarted || isGameOver) return;

  requestAnimationFrame(animate);
  world.step(1 / 60);

  const now = Date.now();
  if (now - lastSpeedIncreaseTime > 10000) {
    speedMultiplier += 0.1;
    lastSpeedIncreaseTime = now;
  }

  moveWorldForward(0.05 * speedMultiplier); 

  shootBalls.forEach(({ mesh, body }) => {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  });

  shootBalls.forEach(({ mesh, body }, i) => {
    glassBlocks.forEach((g, j) => {
      const dist = mesh.position.distanceTo(g.mesh.position);
      if (dist < 0.5) {
        explodeGlass(g.mesh.position);
        scene.remove(g.mesh);
        world.removeBody(g.body);
        glassBlocks.splice(j, 1);
        score++;
        document.getElementById('score').textContent = score;
      }
    });

    crystals.forEach((c) => {
      if (c.collected) return;
      const dist = mesh.position.distanceTo(c.mesh.position);
      if (dist < 0.4) {
        soundCrystal.currentTime = 0;
        soundCrystal.play();
        scene.remove(c.mesh);
        world.removeBody(c.body);
        c.collected = true;
        ballCount += 3;
        document.getElementById('ball-count').textContent = ballCount;
      }
    });
  });

  // 🔥 檢查玻璃是否撞到玩家相機位置，觸發 Game Over
  glassBlocks.forEach((g) => {
    const dist = g.mesh.position.distanceTo(camera.position);
    if (dist < 0.4) {
      endGame();
    }
  });

  cleanupBehindCamera();
  renderer.render(scene, camera);
}

function resetGame() {
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
  gameStarted = true;
  bgm.currentTime = 0;
  bgm.play(); // 重新開始時播放音樂
  animate();
}


async function updateLeaderboard() {
  const scoresRef = db.collection("scores");

  // 新增當前分數
  await scoresRef.add({
    name: playerName,
    score: score,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  // 取得分數前五名
  const snapshot = await scoresRef.orderBy("score", "desc").limit(5).get();
  const top5 = snapshot.docs.map(doc => doc.data());

  // 顯示在畫面上
  const container = document.getElementById("leaderboard");
  container.innerHTML = `<h3>🏆 記分板</h3>` + top5.map((e, i) =>
    `${i+1}. ${e.name} - ${e.score}`
  ).join("<br>");
}
