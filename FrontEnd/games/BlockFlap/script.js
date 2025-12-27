document.addEventListener("DOMContentLoaded", () => {

    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const scoreElement = document.getElementById("score");
    const highScoreElement = document.getElementById("highScore");
    const leaderboardElement = document.getElementById("leaderboard");
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const restartBtn = document.getElementById("restartBtn");

    const GAME_NAME = "BlockFlap";

    // ---------------- LOGIN CHECK ----------------
    const currentUser = localStorage.getItem("currentUser");
    if (!currentUser) {
        alert("You must be logged in to play!");
        window.location.href = "/login.html";
        return;
    }

    // ---------------- CANVAS SIZE ----------------
    const uiPanel = document.querySelector(".ui-panel");
    canvas.height = uiPanel.clientHeight;
    canvas.width = 400;

    // ---------------- GAME STATE ----------------
    let score = 0;
    let highScore = 0;
    let gameRunning = false;
    let frameCount = 0;
    let gameStarted = false;

    // ---------------- BIRD ----------------
    let bird = {
        x: 50,
        y: 150,
        width: 20,
        height: 20,
        velocity: 0,
        gravity: 0.6,
        jump: -8
    };

    // ---------------- PIPES ----------------
    let pipes = [];
    const pipeWidth = 40;
    const pipeGap = 130;
    const pipeSpeed = 3;

    // ---------------- GAME LOOP ----------------
    function drawGame() {
        if (!gameRunning) return;

        updateBird();
        updatePipes();

        if (checkCollision()) {
            gameOver();
            return;
        }

        clearCanvas();
        drawPipes();
        drawBird();
        updateScore();

        requestAnimationFrame(drawGame);
    }

    // ---------------- DRAWING ----------------
    function clearCanvas() {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawBird() {
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }

    function drawPipes() {
        ctx.fillStyle = "red";
        pipes.forEach(pipe => {
            ctx.fillRect(pipe.x, 0, pipeWidth, pipe.topHeight);
            ctx.fillRect(pipe.x, canvas.height - pipe.bottomHeight, pipeWidth, pipe.bottomHeight);
        });
    }

    function drawClickToPlay() {
        clearCanvas();
        drawBird();
        ctx.fillStyle = "white";
        ctx.font = "20px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Click or Press Space to Play", canvas.width / 2, canvas.height - 30);
    }

    // ---------------- UPDATES ----------------
    function updateBird() {
        bird.velocity += bird.gravity;
        bird.y += bird.velocity;
        if (bird.y < 0) { 
            bird.y = 0; 
            bird.velocity = 0; 
        }
    }

    function updatePipes() {
        frameCount++;

        if (frameCount % 100 === 0) {
            let topHeight = Math.random() * (canvas.height - pipeGap - 40) + 20;
            let bottomHeight = canvas.height - pipeGap - topHeight;

            pipes.push({
                x: canvas.width,
                topHeight,
                bottomHeight,
                passed: false
            });
        }

        pipes.forEach(pipe => {
            pipe.x -= pipeSpeed;
            if (pipe.x + pipeWidth < bird.x && !pipe.passed) {
                score++;
                pipe.passed = true;
            }
        });

        pipes = pipes.filter(pipe => pipe.x + pipeWidth > 0);
    }

    // ---------------- COLLISION ----------------
    function checkCollision() {
        if (bird.y + bird.height >= canvas.height) return true;

        return pipes.some(pipe =>
            bird.x < pipe.x + pipeWidth &&
            bird.x + bird.width > pipe.x &&
            (bird.y < pipe.topHeight ||
            bird.y + bird.height > canvas.height - pipe.bottomHeight)
        );
    }

    // ---------------- SCORE ----------------
    function updateScore() {
        scoreElement.textContent = score;

        // Update highScore display in real-time during game
        if (score > highScore) {
            highScore = score;
            highScoreElement.textContent = highScore;
        }
    }

    // ---------------- GAME OVER ----------------
    async function gameOver() {
        gameRunning = false;
        gameOverOverlay.style.display = "block";
        clearCanvas();

        // Save personal best FIRST
        await saveHighscoreToDB();
        
        // Then save to leaderboard (always saves current score)
        await saveLeaderboardScoreToDB();
        
        // Finally update leaderboard UI
        await updateLeaderboardUI();
    }
    // ---------------- RESTART ----------------
    function restartGame() {
        bird.y = 150;
        bird.velocity = 0;
        pipes = [];
        score = 0;
        frameCount = 0;
        gameStarted = false;
        gameRunning = false;
        gameOverOverlay.style.display = "none";

        scoreElement.textContent = score;
        highScoreElement.textContent = highScore;

        drawClickToPlay();
    }

// ---------------- HIGH SCORE (CORRECTED) ----------------
async function loadHighScore() {
    try {
        const res = await fetch(
            `http://localhost:5000/api/highscore/${currentUser}/${GAME_NAME}`
        );

        if (!res.ok) throw new Error("Failed to load highscore");

        const data = await res.json();
        highScore = data.highscore || 0;
        highScoreElement.textContent = highScore;
        
        console.log("Loaded highscore:", highScore); // Debug log
    } catch (err) {
        console.error("Highscore load error:", err);
        highScore = 0;
        highScoreElement.textContent = "0";
    }
}

async function saveHighscoreToDB() {
    // Save if score is higher OR if it's the first score (highScore === 0 and score > 0)
    if (score < highScore) {
        console.log("Score not high enough to save:", score, "vs", highScore);
        return;
    }

    try {
        console.log("Saving highscore:", score); // Debug log
        
        const res = await fetch("http://localhost:5000/api/highscore/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser,
                game: GAME_NAME,
                score: score
            })
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        highScore = data.highscore;
        highScoreElement.textContent = highScore;
        
        console.log("Highscore saved successfully:", highScore); // Debug log
    } catch (err) {
        console.error("Highscore save error:", err);
    }
}

    // ---------------- LEADERBOARD ----------------
    async function saveLeaderboardScoreToDB() {
        try {
            await fetch("http://localhost:5000/api/leaderboard/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: currentUser,
                    game: GAME_NAME,
                    score
                })
            });
        } catch (err) {
            console.log("Leaderboard save error:", err);
        }
    }

    async function updateLeaderboardUI() {
        try {
            const res = await fetch(`http://localhost:5000/api/leaderboard/${GAME_NAME}`);
            const data = await res.json();

            leaderboardElement.innerHTML = "";
            data.forEach(entry => {
                const li = document.createElement("li");
                li.textContent = `${entry.username} — ${entry.score}`;
                leaderboardElement.appendChild(li);
            });
        } catch (err) {
            console.log("Leaderboard fetch error:", err);
        }
    }

    // ---------------- CONTROLS ----------------
    function jump() {
        if (!gameStarted) startGame();
        else if (gameRunning) bird.velocity = bird.jump;
        else if (!gameRunning && gameStarted) restartGame();
    }

    document.addEventListener("keydown", e => {
        if (e.code === "Space" || e.code === "ArrowUp") {
            jump();
            e.preventDefault();
        }
    });

    document.addEventListener("mousedown", jump);
    restartBtn.addEventListener("click", restartGame);

    function startGame() {
        gameRunning = true;
        gameStarted = true;
        gameOverOverlay.style.display = "none";
        drawGame();
    }

    document.getElementById("homeBtn")?.addEventListener("click", () => {
        window.location.href = "../dashboard/dashboard.html";
    });

    // ---------------- INITIAL ----------------
    async function initGame() {
        await loadHighScore();      // ✅ FIRST
        restartGame();              // keeps highScore intact
        await updateLeaderboardUI();
    }

    initGame();

});
