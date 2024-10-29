const express = require('express');
const Valkey = require("iovalkey");
const cors = require('cors');
const app = express();
const { Profanity, ProfanityOptions } = require('@2toad/profanity');
const AWS = require('aws-sdk');
const crypto = require('crypto');


// Create separate CORS options for the health endpoint
const healthCorsOptions = {
  origin: true, // Allow all origins for health endpoint
  methods: ['GET'],
  optionsSuccessStatus: 200
};

// LB Healthcheck

// Health endpoint with its own CORS configuration
app.get('/health', cors(healthCorsOptions), (req, res) => {
  res.status(200).json({ status: 'OK' });
});


// if you change cors origin, remember to restart or it will ignore
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
console.log(`CORS Origin configured as: ${CORS_ORIGIN}`);
// const corsOptions = {
//   origin: CORS_ORIGIN,
//   methods: ['GET', 'POST'],
//   optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
// };

const corsOptions = {
  origin: function (origin, callback) {
    console.log('Incoming request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin provided');
      return callback(null, true);
    }

    if (CORS_ORIGIN === '*') {
      // Allow any origin if CORS_ORIGIN is set to wildcard
      console.log('Allowing request due to wildcard CORS policy');
      return callback(null, true);
    }

    // Check if the origin matches the allowed origin
    if (origin === CORS_ORIGIN) {
      console.log('Origin matched allowed CORS_ORIGIN');
      return callback(null, true);
    }

    // If we got here, origin is not allowed
    console.log('Origin not allowed:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 200
};


app.use(cors(corsOptions));
//app.use('(?!/health)', cors(corsOptions));
app.use(express.json());
app.use('/', express.static('public'));

// Get Valkey server address from environment variable
const VALKEY_SERVER = process.env.VALKEY_SERVER || '127.0.0.1:6379';
const [host, port] = VALKEY_SERVER.split(':');
// Get username and TLS setting from environment variables
const VALKEY_USERNAME = process.env.VALKEY_USERNAME || 'default';
const VALKEY_TLS = process.env.VALKEY_TLS === 'true';

const client = new Valkey({
  port: parseInt(port),
  host: host,
  username: VALKEY_USERNAME,
  tls: VALKEY_TLS
});

// set AWS stuff up
const region = process.env.AWS_REGION || 'eu-west-1';
AWS.config.update({ region: region });
AWS.config.logger = console;
const secretsManager = new AWS.SecretsManager();
const credentials = new AWS.ECSCredentials();
const RESET_SECRETKEY = process.env.RESET_SECRETKEY || 'leaderboard-reset';
AWS.config.update({ 
  credentials: credentials,
  region: region 
});

// Function to get the admin password from Secrets Manager
async function getAdminPassword() {
  const params = {
    SecretId: RESET_SECRETKEY, 
    VersionStage: 'AWSCURRENT', 
  };

  try {
    console.log('Attempting to retrieve secret...');
    const data = await secretsManager.getSecretValue(params).promise();
    console.log('Secret retrieved successfully');
    if ('SecretString' in data) {
      const secret = JSON.parse(data.SecretString);
      return secret.adminPassword; 
    } else {
      throw new Error('Secret not found in SecretString');
    }
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
}

const LEADERBOARD_KEY = 'game:leaderboard';
const HASH_KEY = 'game:score_hashes';

app.post('/api/scores', async (req, res) => {
  const { name, score } = req.body;
  try {
    // Generate a unique hash
    const timestamp = Date.now();
    const dataToHash = `${name}:${score}:${timestamp}`;
    const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    // Add score to leaderboard
    await client.zadd(LEADERBOARD_KEY, score, name);

    // Store the hash with the score details
    await client.hset(HASH_KEY, hash, JSON.stringify({ name, score, timestamp }));

    res.status(200).json({ message: 'Score added successfully', hash: hash });
  } catch (error) {
    console.error('Error adding score:', error);
    res.status(500).json({ error: 'Failed to add score' });
  }
});

app.get('/api/scores', async (req, res) => {
  try {
    const limit = 15;
    const scores = await client.zrevrange(LEADERBOARD_KEY, 0, limit - 1, 'WITHSCORES');
    const result = [];
    for (let i = 0; i < scores.length; i += 2) {
      const name = scores[i];
      const score = parseInt(scores[i + 1]);
      // Fetch the hash for this score
      const hashes = await client.hgetall(HASH_KEY);
      const hash = Object.keys(hashes).find(key => {
        const data = JSON.parse(hashes[key]);
        return data.name === name && data.score === score;
      });
      result.push({ name, score, hash });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ error: 'Failed to get scores' });
  }
});

app.get('/api/verify/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const scoreData = await client.hget(HASH_KEY, hash);
    if (scoreData) {
      res.status(200).json(JSON.parse(scoreData));
    } else {
      res.status(404).json({ error: 'Hash not found' });
    }
  } catch (error) {
    console.error('Error verifying hash:', error);
    res.status(500).json({ error: 'Failed to verify hash' });
  }
});

// reset-leaderboard

app.post('/api/reset-leaderboard', async (req, res) => {
  try {
    console.log('Resetting leaderboard...');
    const adminPassword = await getAdminPassword();
    const { password } = req.body;

    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await client.del(LEADERBOARD_KEY);
    await client.del(HASH_KEY);
    await client.zadd(LEADERBOARD_KEY, 0, 'DefaultPlayer');
    console.log('Leaderboard reset successfully');
    res.status(200).json({ message: 'Leaderboard reset successfully' });
  } catch (error) {
    console.error('Error resetting leaderboard:', error);
    res.status(500).json({ error: 'Failed to reset leaderboard' });
  }
});



// Initialize the profanity filter
const options = new ProfanityOptions();
options.wholeWord = false; // This will catch profanity within words
const profanity = new Profanity(options);

//profanity.addWords(['customBadWord1', 'customBadWord2']); // Add any custom words you want to filter

// New API endpoint for profanity check
app.post('/api/check-profanity', (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const containsProfanity = profanity.exists(name);

  if (containsProfanity) {
    res.json({ result: 'fail', message: 'The name contains inappropriate language.' });
  } else {
    res.json({ result: 'pass', message: 'The name is appropriate.' });
  }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`AWS Region: ${region}`);
  console.log(`Secret Key: ${RESET_SECRETKEY}`);
  console.log(`CORS Origin: ${CORS_ORIGIN}`);
});
