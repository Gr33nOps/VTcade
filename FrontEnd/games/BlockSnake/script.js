const gameEl = document.getElementById("game");
const uiEl = document.getElementById("ui");

const WIDTH = 32;
const HEIGHT = 20;

let snake, dx, dy, food, score, alive, highScore;
let leaderboard = [];

function initGame() {
    snake = [{x: 10, y: 10}];
    dx = 1; dy = 0;
    score = 0;
    alive = true;
    highScore = Number(localStorage.getItem('highscore') || 0);
    placeFood();
    draw();
}

function placeFood() {
    let valid = false;
    while(!valid) {
        food = {x: Math.floor(Math.random()*WIDTH), y: Math.floor(Math.random()*HEIGHT)};
        valid = !snake.some(seg => seg.x === food.x && seg.y === food.y);
        // don't put on walls
        if(food.x===0 || food.x===WIDTH-1 || food.y===0 || food.y===HEIGHT-1) valid=false;
    }
}

function draw() {
    // --- Game grid ---
    let out = "";
    out += "+" + "-".repeat(WIDTH-2) + "+\n";
    for(let y=0;y<HEIGHT;y++){
        let line = "|";
        for(let x=0;x<WIDTH-2;x++){
            let ch = " ";
            if(snake.some(seg => seg.x===x+1 && seg.y===y)) ch = "█";
            if(food.x===x+1 && food.y===y) ch="▓";
            line += ch;
        }
        line += "|\n";
        out += line;
    }
    out += "+" + "-".repeat(WIDTH-2) + "+\n";

    if(!alive) out += "< PROGRAM TERMINATED >\nPRESS ANY ARROW KEY TO RESTART\n";

    gameEl.textContent = out;

    // --- UI on right ---
    let ui = `SCORE: ${score}\nHIGHSCORE: ${highScore}\n\nLEADERBOARD:\n`;
    leaderboard.slice(0,5).forEach((s,i)=>ui+=`${i+1}. ${s}\n`);
    uiEl.textContent = ui;
}

function moveSnake() {
    const head = snake[0];
    const newHead = {x: head.x + dx, y: head.y + dy};

    // walls
    if(newHead.x <=0 || newHead.x >= WIDTH-1 || newHead.y <=0 || newHead.y >= HEIGHT-1) {
        alive = false; updateHighScore(); return;
    }

    // self collision
    if(snake.some(seg => seg.x===newHead.x && seg.y===newHead.y)) {
        alive = false; updateHighScore(); return;
    }

    // eat food
    if(newHead.x===food.x && newHead.y===food.y){
        score += 10;
        snake.unshift(newHead);
        placeFood();
    } else {
        snake.unshift(newHead);
        snake.pop();
    }

    if(score>highScore) highScore = score;
}

function updateHighScore(){
    if(score>Number(localStorage.getItem('highscore')||0)) localStorage.setItem('highscore',score);
    leaderboard.unshift(score);
    leaderboard.sort((a,b)=>b-a);
}

function gameLoop(){
    if(alive) moveSnake();
    draw();
    setTimeout(gameLoop, 120);
}

document.addEventListener("keydown", e=>{
    if(!alive){ initGame(); return; }

    switch(e.key){
        case "ArrowUp": if(dy!==1){dx=0; dy=-1;} break;
        case "ArrowDown": if(dy!==-1){dx=0; dy=1;} break;
        case "ArrowLeft": if(dx!==1){dx=-1; dy=0;} break;
        case "ArrowRight": if(dx!==-1){dx=1; dy=0;} break;
    }
});

initGame();
gameLoop();
