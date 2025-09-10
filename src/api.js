const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

const serverPool = require('./serverPool');
const configManager = require('./configManager');
const User = require('./models/userModel');

// --- 1. Passport.js Configuration ---
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return done(null, false, { message: 'Incorrect email.' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// Middleware to check if the user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login.html');
}


function startApiServer(port) {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // --- 2. Session and Passport Middleware ---
    app.use(session({
        secret: 'a very secret key for your load balancer',
        resave: false,
        saveUninitialized: false,
    }));
    app.use(passport.initialize());
    app.use(passport.session());

    const staticPath = path.join(__dirname, '..', 'public');
    app.use(express.static(staticPath));

    // --- 3. Authentication Routes ---
    app.post('/api/users/register', async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).send('Email and password are required.');
            }
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return res.status(400).send('An account with this email already exists.');
            }
            const newUser = new User({ email, password });
            await newUser.save();
            res.status(201).send('User created successfully. Please log in.');
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).send('Error registering new user.');
        }
    });

    app.post('/api/users/login', passport.authenticate('local', {
        successRedirect: '/dashboard.html',
        failureRedirect: '/login.html',
    }));
    
    app.get('/api/users/logout', (req, res, next) => {
        req.logout(function(err) {
            if (err) { return next(err); }
            res.redirect('/login.html');
        });
    });


    // --- 4. Protected Page Routes ---
    app.get('/dashboard.html', isAuthenticated, (req, res) => {
        res.sendFile(path.join(staticPath, 'dashboard.html'));
    });
    
    // --- THIS IS THE FIX ---
    app.get('/traffic', isAuthenticated, (req, res) => {
        res.sendFile(path.join(staticPath, 'traffic-dashboard.html'));
    });
    
    app.get('/', isAuthenticated, (req, res) => {
        res.redirect('/dashboard.html');
    });

    // --- 5. Protected API Routes ---
    app.get('/api/config', isAuthenticated, (req, res) => {
        res.json(configManager.getConfig());
    });

    app.put('/api/routing-rules', isAuthenticated, (req, res) => {
        const { path, pools } = req.body;
        if (!path || !Array.isArray(pools)) {
            return res.status(400).send('Invalid request body. Requires "path" and "pools" array.');
        }
        const isValid = pools.every(p => typeof p.name === 'string' && typeof p.weight === 'number');
        if (!isValid) {
            return res.status(400).send('Each pool in the array must have a "name" (string) and "weight" (number).');
        }
        const success = configManager.updateRoutingRule(path, pools);
        if (success) {
            res.status(200).send(`Routing rule for ${path} updated successfully.`);
        } else {
            res.status(404).send(`Routing rule for path ${path} not found.`);
        }
    });

    app.get('/metrics', isAuthenticated, (req, res) => {
        res.json(serverPool.getMetrics());
    });
    
    app.get('/servers/metrics', isAuthenticated, (req, res) => {
        res.json(serverPool.getServerMetrics());
    });

    app.get('/pools', isAuthenticated, (req, res) => {
        res.json(serverPool.getPools());
    });

    app.post('/pools/:poolName/servers', isAuthenticated, (req, res) => {
        const { poolName } = req.params;
        const { serverUrl } = req.body;
        const success = serverPool.addServer(poolName, serverUrl);
        if (success) {
            res.status(201).send(`Server ${serverUrl} added to pool ${poolName}`);
        } else {
            res.status(404).send(`Pool not found or server already exists.`);
        }
    });

    app.delete('/pools/:poolName/servers/:serverId', isAuthenticated, (req, res) => {
        const { poolName, serverId } = req.params;
        const decodedServerId = Buffer.from(serverId, 'base64').toString('ascii');
        const success = serverPool.removeServer(poolName, decodedServerId);
        if (success) {
            res.status(200).send(`Server ${decodedServerId} removed from pool ${poolName}`);
        } else {
            res.status(404).send(`Pool ${poolName} or server ${decodedServerId} not found.`);
        }
    });

    app.listen(port, () => {
        console.log(`Control Plane API & Dashboard running on http://localhost:${port}`);
    });
}

module.exports = { startApiServer };