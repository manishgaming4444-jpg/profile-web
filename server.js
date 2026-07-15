const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required folders exist
['users', 'uploads'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Serve static public files (CSS, JS)
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Multer — file upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const username = req.body.username || 'unknown';
        const dir = path.join(__dirname, 'uploads', username);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const fieldname = file.fieldname === 'photo' ? 'photo' : 'song';
        cb(null, `${fieldname}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// ─── ROUTES ─────────────────────────────────────────────

// Home → redirect to create
app.get('/', (req, res) => res.redirect('/create'));

// GET /create → show creator form
app.get('/create', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

// POST /create → save user and redirect to profile
app.post('/create', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'song', maxCount: 1 }
]), (req, res) => {
    try {
        const { username, displayname, instagram, discord, youtube } = req.body;

        // Validate username
        if (!username || !/^[a-z0-9_]{2,20}$/.test(username)) {
            return res.status(400).send('Invalid username. Use 2-20 lowercase letters, numbers, or underscores only.');
        }

        const userData = {
            username,
            displayname: displayname || username,
            instagram: instagram || '',
            discord: discord || '',
            youtube: youtube || '',
            photo: req.files['photo'] ? `photo${path.extname(req.files['photo'][0].originalname)}` : '',
            song: req.files['song'] ? `song${path.extname(req.files['song'][0].originalname)}` : '',
            createdAt: new Date().toISOString()
        };

        // Save user data as JSON
        fs.writeFileSync(
            path.join(__dirname, 'users', `${username}.json`),
            JSON.stringify(userData, null, 2)
        );

        res.redirect(`/${username}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong. Please try again.');
    }
});

// GET /uploads/:username/:file → serve user uploaded files
app.get('/uploads/:username/:file', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.username, req.params.file);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

// GET /:username → serve dynamic profile page
app.get('/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    const userFile = path.join(__dirname, 'users', `${username}.json`);

    if (!fs.existsSync(userFile)) {
        return res.status(404).send(`
            <html><body style="font-family:sans-serif;background:#050505;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
                <h1 style="font-size:3rem;">404</h1>
                <p>Profile <b>${username}</b> not found.</p>
                <a href="/create" style="color:#8a2be2;margin-top:1rem;">Create your profile →</a>
            </body></html>
        `);
    }

    const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    let template = fs.readFileSync(path.join(__dirname, 'template', 'profile.html'), 'utf-8');

    // Photo URL
    const photoUrl = user.photo ? `/uploads/${user.username}/${user.photo}` : '/public/default-avatar.png';
    // Song URL
    const songUrl = user.song ? `/uploads/${user.username}/${user.song}` : '';
    const songHidden = songUrl ? '' : 'style="display:none"';

    // Replace all placeholders
    template = template
        .replace(/\{\{USERNAME\}\}/g, user.username)
        .replace(/\{\{DISPLAYNAME\}\}/g, user.displayname)
        .replace(/\{\{PHOTO_URL\}\}/g, photoUrl)
        .replace(/\{\{SONG_URL\}\}/g, songUrl)
        .replace(/\{\{SONG_HIDDEN\}\}/g, songHidden)
        .replace(/\{\{INSTAGRAM\}\}/g, user.instagram || '#')
        .replace(/\{\{DISCORD\}\}/g, user.discord || '#')
        .replace(/\{\{YOUTUBE\}\}/g, user.youtube || '#')
        .replace(/\{\{INSTAGRAM_VISIBLE\}\}/g, user.instagram ? '' : 'display:none')
        .replace(/\{\{DISCORD_VISIBLE\}\}/g, user.discord ? '' : 'display:none')
        .replace(/\{\{YOUTUBE_VISIBLE\}\}/g, user.youtube ? '' : 'display:none');

    res.send(template);
});

// ─── START SERVER ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Server running at: http://localhost:${PORT}`);
    console.log(`📝 Create profile:    http://localhost:${PORT}/create\n`);
});
