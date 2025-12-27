document.addEventListener("DOMContentLoaded", () => {

    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");

    const scoreElement = document.getElementById("score");
    const highScoreElement = document.getElementById("highScore");
    const leaderboardElement = document.getElementById("leaderboard");
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const restartBtn = document.getElementById("restartBtn");

    const GAME_NAME = "BlockRun";

    // ---------------- LOGIN CHECK ----------------
    const currentUser = localStorage.getItem("currentUser");
    if (!currentUser) {
        alert("You must be logged in to play!");
        window.location.href = "/login.html";
        return;
    }

    // ---------------- GAME STATE ----------------
    let score = 0;
    let highScore = 0;
    let frame = 0;
    let gameRunning = false;
    let gameStarted = false;
    let animationId = null;
    let gameSpeed = 4;

    // ---------------- PLAYER ----------------
    const player = {
        x: 50,
        y: 320,
        width: 25,
        height: 25,
        velocityY: 0,
        gravity: 0.8,
        jumpPower: -15,
        groundY: 320,
        isJumping: false
    };

    // ---------------- OBSTACLES ----------------
    let obstacles = [];
    let nextObstacleFrame = 40; 

    // ---------------- DRAWING ----------------
    function clearCanvas() {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawGround() {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 350);
        ctx.lineTo(canvas.width, 350);
        ctx.stroke();
    }

    function drawPlayer() {
        ctx.fillStyle = "#0f0";
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }

    function drawObstacles() {
        ctx.fillStyle = "red";
        obstacles.forEach(o => {
            ctx.fillRect(o.x, o.y, o.width, o.height);
        });
    }

    function drawClickToPlay() {
        clearCanvas();
        drawGround();
        drawPlayer();
        ctx.fillStyle = "white";
        ctx.font = "20px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Click or Press Space to Play", canvas.width / 2, canvas.height - 30);
    }

    // ---------------- UPDATES ----------------
    function updatePlayer() {
        player.velocityY += player.gravity;
        player.y += player.velocityY;

        if (player.y >= player.groundY) {
            player.y = player.groundY;
            player.velocityY = 0;
            player.isJumping = false;
        }
    }

    function updateObstacles() {
        frame++;

        if (frame >= nextObstacleFrame) {
            let height = Math.random() > 0.5 ? 25 : 40;
            obstacles.push({
                x: canvas.width,
                y: 350 - height,
                width: 20,
                height: height,
                passed: false
            });

            nextObstacleFrame = frame + Math.floor(Math.random() * 80 + 80);
        }

        obstacles.forEach(o => {
            o.x -= gameSpeed;

            if (!o.passed && o.x + o.width < player.x) {
                o.passed = true;
                score++;
                if (score % 10 === 0 && gameSpeed < 7) gameSpeed += 0.3;
            }
        });

        obstacles = obstacles.filter(o => o.x + o.width > 0);
    }

    // ---------------- COLLISION ----------------
    function checkCollision() {
        return obstacles.some(o =>
            player.x < o.x + o.width &&
            player.x + player.width > o.x &&
            player.y < o.y + o.height &&
            player.y + player.height > o.y
        );
    }

    // ---------------- SCORE ----------------
    function updateScore() {
        scoreElement.textContent = score;
        if (score > highScore) {
            highScore = score;
            highScoreElement.textContent = highScore;
        }
    }

    // ---------------- GAME LOOP ----------------
    function drawGame() {
        if (!gameRunning) return;

        updatePlayer();
        updateObstacles();

        if (checkCollision()) return gameOver();

        clearCanvas();
        drawGround();
        drawPlayer();
        drawObstacles();
        updateScore();

        animationId = requestAnimationFrame(drawGame);
    }

    // ---------------- GAME OVER ----------------
    async function gameOver() {
        gameRunning = false;
        cancelAnimationFrame(animationId);

        gameOverOverlay.style.display = "block";

        // Save highscore first
        await saveHighscore();
        await saveLeaderboard();
        await loadLeaderboard();
    }

    // ---------------- RESTART ----------------
    function restartGame() {
        obstacles = [];
        score = 0;
        frame = 0;
        gameSpeed = 4;
        nextObstacleFrame = 40; // Fixed: reset for consistent behavior

        player.y = player.groundY;
        player.velocityY = 0;

        gameOverOverlay.style.display = "none";
        gameStarted = false;
        gameRunning = false;

        drawClickToPlay();
    }

    // ---------------- JUMP ----------------
    function jump() {
        if (!gameStarted) startGame();
        else if (gameRunning && !player.isJumping) {
            player.velocityY = player.jumpPower;
            player.isJumping = true;
        } else if (!gameRunning) restartGame();
    }

    // ---------------- START GAME ----------------
    function startGame() {
        gameStarted = true;
        gameRunning = true;
        gameOverOverlay.style.display = "none";
        drawGame();
    }

    // ---------------- DB: LOAD HIGHSCORE ----------------
    async function loadHighScore() {
        try {
            const r = await fetch(`http://localhost:5000/api/highscore/${currentUser}/${GAME_NAME}`);
            const data = await r.json();
            highScore = data.highscore || 0;
            highScoreElement.textContent = highScore;
        } catch {
            highScore = 0;
            highScoreElement.textContent = "0";
        }
    }

    // ---------------- DB: SAVE HIGHSCORE ----------------
    async function saveHighscore() {
        if (score < highScore) return;

        const r = await fetch("http://localhost:5000/api/highscore/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser,
                game: GAME_NAME,
                score
            })
        });

        const data = await r.json();
        highScore = data.highscore;
        highScoreElement.textContent = highScore;
    }

    // ---------------- DB: SAVE LEADERBOARD ----------------
    async function saveLeaderboard() {
        await fetch("http://localhost:5000/api/leaderboard/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser,
                game: GAME_NAME,
                score
            })
        });
    }

    // ---------------- DB: LOAD LEADERBOARD ----------------
    async function loadLeaderboard() {
        const r = await fetch(`http://localhost:5000/api/leaderboard/${GAME_NAME}`);
        const data = await r.json();

        leaderboardElement.innerHTML = "";
        data.forEach(entry => {
            const li = document.createElement("li");
            li.textContent = `${entry.username} — ${entry.score}`;
            leaderboardElement.appendChild(li);
        });
    }

    // ---------------- CONTROLS ----------------
    document.addEventListener("keydown", e => {
        if (e.code === "Space" || e.code === "ArrowUp") {
            jump();
            e.preventDefault();
        }
    });
    document.addEventListener("mousedown", jump);
    restartBtn.addEventListener("click", restartGame);

    document.getElementById("homeBtn").addEventListener("click", () => {
        window.location.href = "../dashboard/dashboard.html";
    });

    // ---------------- INIT ----------------
    async function init() {
        await loadHighScore();
        await loadLeaderboard();
        restartGame();
    }

    init();
});