// Main game logic will go here
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const API_URL = CONFIG.API_URL;


canvas.width = 800;
canvas.height = 600;

// Game variables
let player = {
    x: 50,
    y: 300,
    width: 60,
    height: 40,
    speed: 5,
    vx: 0,
    vy: 0,
    gravity: 0.2,
    lift: -10
};
let hazards = [];
let backgroundX = 0;
let gameOver = false;
let score = 0;
let gameStarted = false;
let gameTime = 0;
let difficultyMultiplier = 1;
let lastDifficultyIncrease = 0;
let highScores = [];
let hasPromptedForName = false;

// Sound effects
const collisionSound = new Audio('audio/ouch.mp3');
//const scoreSound = new Audio('nice.mp3');
const scoreSound = new Audio('audio/point.wav');

// Load images
const backgroundImage = new Image();
backgroundImage.src = 'images/sprites/titan-lunar-background.png';

const rocketImage = new Image();
rocketImage.src = 'images/sprites/titan-sprite-rockets.png';

const asteroidImage = new Image();
asteroidImage.src = 'images/sprites/rock-1.png';

const gasCloudImage = new Image();
gasCloudImage.src = 'images/sprites/hazzard-1.png';

const dustCloudImage = new Image();
dustCloudImage.src = 'images/sprites/alien-1.png';

// Alpha Numeric checker

function isAlphanumeric(str) {
  return /^[a-zA-Z0-9]+$/.test(str);
}


// Game loop
function gameLoop() {
    // Update game state
    update();
    
    // Render game
    render();
    
    // Request next frame
    requestAnimationFrame(gameLoop);
}

async function addHighScore(name, score) {
    try {
      const response = await fetch(`${API_URL}/api/scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, score }),
      });
      if (!response.ok) {
        throw new Error('Failed to add score');
      }
      console.log('Score added successfully');
    } catch (error) {
      console.error('Error adding high score:', error);
    }
  }
  
  async function getTopScores() {
    try {
      const response = await fetch(`${API_URL}/api/scores`);
      if (!response.ok) {
        throw new Error('Failed to get scores');
      }
      const scores = await response.json();
      //console.log('Top scores:', scores);
      return scores;
    } catch (error) {
      console.error('Error getting top scores:', error);
      return [];
    }
  }

async function loadHighScores() {
    highScores = await getTopScores();
}

// Update game state
function update() {
    if (!gameStarted) return;
    // if (gameOver) return;
    if (gameOver) {
        handleGameOver();
        return;
    }


    gameTime += 1/60; // Assuming 60 FPS
    if (gameTime - lastDifficultyIncrease >= 5) { // Increase difficulty every 30 seconds
        difficultyMultiplier += 0.1;
        lastDifficultyIncrease = gameTime;
    }
    // Move background
    backgroundX -= 2;
    if (backgroundX <= -canvas.width) {
        backgroundX = 0;
    }

    player.vy += player.gravity;
    player.y += player.vy;
    player.x += player.vx;
    
    // Check for bottom collision
    if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
        if (!player.invulnerable) {
            gameOver = true;
            collisionSound.play();
        }
    }


    if (keys.ArrowUp && player.y > 0) {
        player.vy = -player.speed; // Use negative speed for upward movement
    } else if (keys.ArrowDown && player.y < canvas.height - player.height) {
        player.vy = player.speed;
    } else {
        player.vy = player.gravity; // Only apply gravity when not moving up or down
    }
    
    if (keys.ArrowLeft && player.x > 0) {
        player.vx = -player.speed;
    } else if (keys.ArrowRight && player.x < canvas.width - player.width) {
        player.vx = player.speed;
    } else {
        player.vx = 0;
    }
    

    // Generate hazards
    if (Math.random() < 0.02 * difficultyMultiplier) {
        let hazardType = Math.floor(Math.random() * 3);
        let hazard = {
            x: canvas.width,
            y: Math.random() * (canvas.height - 50),
            width: 50,
            height: 50,
            speed: (Math.random() * 3 + 1) * difficultyMultiplier,
            type: hazardType
        };
        hazards.push(hazard);
    }


for (let i = hazards.length - 1; i >= 0; i--) {
    hazards[i].x -= hazards[i].speed;

    if (checkCollision(player, hazards[i])) {
        if (!player.invulnerable) {
            gameOver = true;
            collisionSound.play();
        }
    }

    if (hazards[i].x + hazards[i].width < 0) {
        hazards.splice(i, 1);
        score++;
        scoreSound.play();
    }
}
}

// Render game
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw scrolling background
    ctx.drawImage(backgroundImage, backgroundX, 0, canvas.width, canvas.height);
    ctx.drawImage(backgroundImage, backgroundX + canvas.width, 0, canvas.width, canvas.height);

    if (!gameStarted) {
        // Draw start screen
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.fillText('Titan Scrolling Game', canvas.width/2 - 180, canvas.height/2 - 80);
        ctx.font = '20px Arial';
        ctx.fillText('Controls:', canvas.width/2 - 40, canvas.height/2 - 20);
        ctx.fillText('↑: Move Up', canvas.width/2 - 40, canvas.height/2 + 10);
        ctx.fillText('←: Move Left', canvas.width/2 - 40, canvas.height/2 + 40);
        ctx.fillText('→: Move Right', canvas.width/2 - 40, canvas.height/2 + 70);
        ctx.fillText('Press SPACE to start', canvas.width/2 - 80, canvas.height/2 + 120);
        // Draw high scores
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText('High Scores:', 10, 30);
        for (let i = 0; i < highScores.length; i++) {
            const score = highScores[i];
            ctx.fillText(`${i + 1}. ${score.name || 'Anonymous'}: ${score.score}`, 10, 60 + i * 20);
        }
    } else {
        // Draw player
        ctx.drawImage(rocketImage, player.x, player.y, player.width, player.height);

        // Draw hazards
        hazards.forEach(hazard => {
            let hazardImage;
            switch(hazard.type) {
                case 0: hazardImage = asteroidImage; break;
                case 1: hazardImage = gasCloudImage; break;
                case 2: hazardImage = dustCloudImage; break;
            }
            ctx.drawImage(hazardImage, hazard.x, hazard.y, hazard.width, hazard.height);
        });

        // Draw score
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText(`Score: ${score}`, 10, 30);

        // Draw game over message
        if (gameOver) {
            ctx.fillStyle = 'red';
            ctx.font = '40px Arial';
            ctx.fillText('Game Over!', canvas.width/2 - 100, canvas.height/2 - 40);
            ctx.font = '20px Arial';
            ctx.fillText('Press SPACE to restart', canvas.width/2 - 90, canvas.height/2 + 20);
            // Draw score and difficulty
            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            ctx.fillText(`Score: ${score}`, 10, 30);
            ctx.fillText(`Difficulty: ${difficultyMultiplier.toFixed(1)}x`, 10, 60);

            // Draw high scores
            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            
            for (let i = 0; i < Math.min(highScores.length, 11); i++) {
                const score = highScores[i];
                ctx.fillText(`${i + 1}. ${score.name}: ${score.score}`, 10, canvas.height/2 - 50 + i * 30);
            }
            
        }

    }
}


async function handleGameOver() {
    if (gameOver) {
      if (!hasPromptedForName && score > (highScores[highScores.length - 1]?.score || 0)) {
        hasPromptedForName = true;
        let name = '';
        let isValidName = false;
        while (!isValidName) {
          name = prompt('Enter your name for the high score (alphanumeric characters only):');
          if (name === null) {
            name = 'Anonymous';
            isValidName = true;
          } else if (!isAlphanumeric(name)) {
            alert('Please use only alphanumeric characters (A-Z, a-z, 0-9).');
          } else {
            try {
              const response = await fetch(`${API_URL}/api/check-profanity`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
              });
  
              if (!response.ok) {
                throw new Error('Network response was not ok');
              }
  
              const data = await response.json();
              if (data.result === 'pass') {
                isValidName = true;
              } else {
                alert('Please choose a different name. This one contains inappropriate language.');
              }
            } catch (error) {
              console.error('Error checking profanity:', error);
              alert('An error occurred while checking the name. Please try again.');
            }
          }
        }
        try {
          const response = await fetch(`${API_URL}/api/scores`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, score }),
          });
  
          if (!response.ok) {
            throw new Error('Failed to add high score');
          }
  
          const result = await response.json();
          const hash = result.hash;
  
          // Display the hash to the player
          alert(`Your score has been recorded! Your unique score hash is: ${hash}\nPlease save this hash for verification.`);
  
          const updatedScores = await getTopScores();
          highScores = updatedScores;
        } catch (error) {
          console.error('Error updating high scores:', error);
          alert('An error occurred while saving your score. Please try again.');
        }
      }
    }
    gameOver = true;

  }



function checkCollision(player, hazard) {
    // Define a smaller hitbox for the player (e.g., 80% of the original size)
    const playerHitboxScale = 0.8;
    const playerHitbox = {
        x: player.x + player.width * (1 - playerHitboxScale) / 2,
        y: player.y + player.height * (1 - playerHitboxScale) / 2,
        width: player.width * playerHitboxScale,
        height: player.height * playerHitboxScale
    };

    // Define a smaller hitbox for the hazard (e.g., 90% of the original size)
    const hazardHitboxScale = 0.9;
    const hazardHitbox = {
        x: hazard.x + hazard.width * (1 - hazardHitboxScale) / 2,
        y: hazard.y + hazard.height * (1 - hazardHitboxScale) / 2,
        width: hazard.width * hazardHitboxScale,
        height: hazard.height * hazardHitboxScale
    };

    return playerHitbox.x < hazardHitbox.x + hazardHitbox.width &&
           playerHitbox.x + playerHitbox.width > hazardHitbox.x &&
           playerHitbox.y < hazardHitbox.y + hazardHitbox.height &&
           playerHitbox.y + playerHitbox.height > hazardHitbox.y;
}


// Handle key presses
let keys = {};
window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'Space') {
        if (!gameStarted) {
            gameStarted = true;
        } else if (gameOver) {
            resetGame();
        }
    }
});
window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
});

function resetGame() {
    player.x = 50;
    player.y = 300;
    player.vx = 0;
    player.vy = 0;
    hazards = [];
    backgroundX = 0;
    gameOver = false;
    score = 0;
    gameTime = 0;
    difficultyMultiplier = 1;
    lastDifficultyIncrease = 0;
    keys = {};
    hasPromptedForName = false;
}


// Ensure all images are loaded before starting the game
let imagesLoaded = 0;
const totalImages = 5;

function imageLoaded() {
    imagesLoaded++;
    if (imagesLoaded === totalImages) {
        // Start the game loop
        gameLoop();
    }
}

backgroundImage.onload = imageLoaded;
rocketImage.onload = imageLoaded;
asteroidImage.onload = imageLoaded;
gasCloudImage.onload = imageLoaded;
dustCloudImage.onload = imageLoaded;
loadHighScores();

function startGame() {
    gameStarted = true;
    gameOver = false;
    score = 0;
    player.x = 50;
    player.y = 300;
    hazards = [];
    loadHighScores();  // Refresh high scores when starting a new game
}
