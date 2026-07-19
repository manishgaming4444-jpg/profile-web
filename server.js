require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).trim();

// Ensure required folders exist
['users', 'uploads'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── MIDDLEWARE ──────────────────────────────────────────
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'xonpro-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));
app.use(passport.initialize());
app.use(passport.session());

// ─── PASSPORT GOOGLE OAUTH ───────────────────────────────
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/auth/google/callback`
}, (accessToken, refreshToken, profile, done) => {
    return done(null, { googleId: profile.id, email: profile.emails[0].value, name: profile.displayName });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ─── HELPERS ─────────────────────────────────────────────
function findUserByGoogleId(googleId) {
    const usersDir = path.join(__dirname, 'users');
    if (!fs.existsSync(usersDir)) return null;
    const files = fs.readdirSync(usersDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const user = JSON.parse(fs.readFileSync(path.join(usersDir, file), 'utf-8'));
        if (user.googleId === googleId) return user;
    }
    return null;
}

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.returnTo = req.originalUrl;
    res.redirect('/auth/google');
}

// ─── MULTER FILE UPLOAD ───────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const username = req.body.username || (req.params && req.params.username) || 'unknown';
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
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── AUTH ROUTES ─────────────────────────────────────────
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/create' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// ─── MAIN ROUTES ─────────────────────────────────────────

// Home
app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.redirect('/create');
});

// GET /dashboard
app.get('/dashboard', isLoggedIn, (req, res) => {
    const existing = findUserByGoogleId(req.user.googleId);
    const dashTemplate = fs.readFileSync(path.join(__dirname, 'views', 'dashboard.html'), 'utf-8');
    const avatarLetter = (req.user.name || req.user.email || 'U')[0].toUpperCase();
    const usernameLink = existing ? existing.username : '';

    let dashboardContent = '';
    let editDisplayname = '', editBio = '', editInstagram = '', editDiscord = '', editYoutube = '', editMusicEnabled = '';
    let currentPhotoPreview = '', currentSongPreview = '';



    if (existing) {
        const photoUrl = existing.photo ? `/uploads/${existing.username}/${existing.photo}` : null;
        const profileUrl = `xonpro.store/${existing.username}`;
        const createdAt = existing.createdAt
            ? new Date(existing.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
            : 'N/A';

        editDisplayname  = existing.displayname || '';
        editBio          = existing.bio          || '';
        editInstagram    = existing.instagram    || '';
        editDiscord      = existing.discord      || '';
        editYoutube      = existing.youtube      || '';
        editMusicEnabled = existing.musicEnabled ? 'checked' : '';



        currentPhotoPreview = photoUrl
            ? `<div class="current-media"><img src="${photoUrl}" alt="Current photo"> <span>Current photo</span></div>`
            : '';
        currentSongPreview = existing.song
            ? `<div class="current-media">🎵 <span>${existing.song} (current)</span></div>`
            : '';

        dashboardContent = `
        <!-- Hero Profile Card -->
        <div class="card card-hero">
            <div class="hero-avatar-wrap">
                ${ photoUrl
                    ? `<img src="${photoUrl}" alt="Profile" class="hero-avatar">`
                    : `<div class="hero-avatar-placeholder">👤</div>`
                }
                <div class="online-dot"></div>
            </div>
            <div class="hero-info">
                <h2 class="hero-name">${existing.displayname}</h2>
                <p class="hero-handle">@${existing.username}</p>
                <div class="hero-btns">
                    <button onclick="showTab('edit', document.querySelectorAll('.sidebar-item')[1])" class="btn-white">✏️ Edit Profile</button>
                    <a href="/${existing.username}" target="_blank" class="btn-ghost">🔗 View Profile</a>
                </div>
            </div>
        </div>

        <!-- Profile URL Card -->
        <div class="card">
            <div class="clabel">Profile Link</div>
            <div class="url-box">
                <div class="url-live"></div>
                <span class="url-text" id="profile-url">https://${profileUrl}</span>
                <button class="url-copy" id="copy-btn" onclick="copyUrl()">Copy</button>
            </div>
            <p style="font-size:0.75rem;color:rgba(255,255,255,0.2);margin-top:0.3rem;">Yahi link share karo apne dosto ke saath!</p>
        </div>

        <!-- Account Info Card -->
        <div class="card" style="grid-column:span 2;">
            <div class="clabel">Account Info</div>
            <div class="info-row"><span class="info-key">Display Name</span><span class="info-val">${existing.displayname}</span></div>
            <div class="info-row"><span class="info-key">Username</span><span class="info-val">@${existing.username}</span></div>
            <div class="info-row"><span class="info-key">Google Email</span><span class="info-val">${req.user.email}</span></div>
            <div class="info-row"><span class="info-key">Profile Created</span><span class="info-val">${createdAt}</span></div>
        </div>
        `;
    } else {
        dashboardContent = `
        <div class="card no-profile-card">
            <div class="big-emoji">🚀</div>
            <h2>Abhi tak koi profile nahi bana!</h2>
            <p>Apna premium profile page abhi banao — bilkul free mein.</p>
            <a href="/create" class="btn-white">✨ Create My Profile</a>
        </div>
        `;
    }

    const html = dashTemplate
        .replace(/\{\{AVATAR_LETTER\}\}/g, avatarLetter)
        .replace(/\{\{GOOGLE_EMAIL\}\}/g, req.user.email || '')
        .replace(/\{\{GOOGLE_NAME\}\}/g, req.user.name || 'User')
        .replace(/\{\{USERNAME_LINK\}\}/g, usernameLink)
        .replace(/\{\{DASHBOARD_CONTENT\}\}/g, dashboardContent)
        .replace(/\{\{EDIT_DISPLAYNAME\}\}/g, editDisplayname)
        .replace(/\{\{EDIT_BIO\}\}/g, editBio)
        .replace(/\{\{EDIT_INSTAGRAM\}\}/g, editInstagram)
        .replace(/\{\{EDIT_DISCORD\}\}/g, editDiscord)
        .replace(/\{\{EDIT_YOUTUBE\}\}/g, editYoutube)
        .replace(/\{\{EDIT_MUSIC_ENABLED\}\}/g, editMusicEnabled)
        .replace(/\{\{CURRENT_PHOTO_PREVIEW\}\}/g, currentPhotoPreview)
        .replace(/\{\{CURRENT_SONG_PREVIEW\}\}/g, currentSongPreview);



    res.send(html);
});

// GET /create → require Google login first
app.get('/create', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.sendFile(path.join(__dirname, 'views', 'login.html'));
    }
    // Already has a profile? Redirect there
    const existing = findUserByGoogleId(req.user.googleId);
    if (existing) return res.redirect(`/${existing.username}`);

    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

// POST /create → save new profile
app.post('/create', isLoggedIn, upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'song', maxCount: 1 }
]), (req, res) => {
    try {
        // One account = one profile check
        const existing = findUserByGoogleId(req.user.googleId);
        if (existing) return res.redirect(`/${existing.username}`);

        const { username, displayname, bio, instagram, discord, youtube } = req.body;

        if (!username || !/^[a-z0-9_]{2,20}$/.test(username)) {
            return res.status(400).send('Invalid username.');
        }

        // Username already taken?
        const userFile = path.join(__dirname, 'users', `${username}.json`);
        if (fs.existsSync(userFile)) {
            return res.redirect(`/create?error=taken&username=${encodeURIComponent(username)}`);
        }

        const userData = {
            username,
            displayname: displayname || username,
            bio: bio || '',
            googleId: req.user.googleId,
            googleEmail: req.user.email,
            instagram: instagram || '',
            discord: discord || '',
            youtube: youtube || '',
            photo: req.files['photo'] ? `photo${path.extname(req.files['photo'][0].originalname)}` : '',
            song: req.files['song'] ? `song${path.extname(req.files['song'][0].originalname)}` : '',
            views: 0,
            createdAt: new Date().toISOString()
        };

        fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
        res.redirect('/dashboard?saved=1');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// GET /:username/edit → redirect to dashboard edit tab
app.get('/:username/edit', isLoggedIn, (req, res) => {
    const username = req.params.username.toLowerCase();
    const userFile = path.join(__dirname, 'users', `${username}.json`);
    if (!fs.existsSync(userFile)) return res.status(404).send('Profile not found.');
    const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    if (user.googleId !== req.user.googleId) return res.status(403).send('Access denied.');
    // Redirect to dashboard edit tab
    res.redirect('/dashboard#edit');
});

// POST /:username/edit → save updates
app.post('/:username/edit', isLoggedIn, upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'song', maxCount: 1 }
]), (req, res) => {
    const username = req.params.username.toLowerCase();
    const userFile = path.join(__dirname, 'users', `${username}.json`);
    if (!fs.existsSync(userFile)) return res.status(404).send('Profile not found.');

    const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    if (user.googleId !== req.user.googleId) return res.status(403).send('Access denied.');

    const { displayname, bio, instagram, discord, youtube, musicEnabled } = req.body;
    user.displayname   = displayname || user.displayname;
    user.bio           = bio !== undefined ? bio : (user.bio || '');
    user.instagram     = instagram || user.instagram;
    user.discord       = discord || user.discord;
    user.youtube       = youtube || user.youtube;
    user.musicEnabled  = musicEnabled === 'on';



    if (req.files['photo']) {
        user.photo = `photo${path.extname(req.files['photo'][0].originalname)}`;
    }
    if (req.files['song']) {
        user.song = `song${path.extname(req.files['song'][0].originalname)}`;
    }

    fs.writeFileSync(userFile, JSON.stringify(user, null, 2));
    res.redirect('/dashboard?saved=1');
});

// Serve uploads
app.get('/uploads/:username/:file', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.username, req.params.file);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('File not found');
});

// GET /:username → serve dynamic profile
app.get('/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    const userFile = path.join(__dirname, 'users', `${username}.json`);

    if (!fs.existsSync(userFile)) {
        return res.status(404).send(`
            <html><body style="font-family:sans-serif;background:#050505;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
                <h1 style="font-size:3rem;">404</h1>
                <p>Profile <b>${username}</b> not found.</p>
                <a href="/create" style="color:#8a2be2;margin-top:1rem;">Create your profile →</a>
            </body></html>`);
    }

    const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));

    // ── Increment view counter ──────────────────────────────────
    user.views = (user.views || 0) + 1;
    fs.writeFileSync(userFile, JSON.stringify(user, null, 2));

    let template = fs.readFileSync(path.join(__dirname, 'template', 'profile.html'), 'utf-8');

    const photoUrl = user.photo ? `/uploads/${user.username}/${user.photo}` : '/public/default-avatar.png';
    const songUrl  = user.song  ? `/uploads/${user.username}/${user.song}`  : '';
    const songHidden    = songUrl ? '' : 'style="display:none"';
    const musicAutoPlay = (user.musicEnabled && songUrl) ? 'true' : 'false';

    // ── Format views nicely ────────────────────────────────────
    const viewsCount = (user.views || 0).toLocaleString('en-IN');

    // ── Bio HTML ───────────────────────────────────────────────
    const bioHtml = user.bio
        ? `<p class="profile-bio">${user.bio.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
        : '';

    // ── Is the logged-in user the owner? ──────────────────────
    const isOwner = req.isAuthenticated() && req.user.googleId === user.googleId;
    const editBtn = isOwner
        ? `<a href="/dashboard#edit" class="edit-profile-btn">✏️ Edit Profile</a>`
        : '';

    // ── Create banner for non-users ────────────────────────────
    const visitorHasProfile = req.isAuthenticated() && findUserByGoogleId(req.user.googleId);
    const createBanner = (!isOwner && !visitorHasProfile)
        ? `<div class="create-banner" id="create-banner">
                <span>✨ <strong>${user.displayname}</strong> ka profile dekh rahe ho? Apna bhi banao!</span>
                <a href="/create">Free mein banao →</a>
           </div>`
        : '';

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
        .replace(/\{\{YOUTUBE_VISIBLE\}\}/g, user.youtube ? '' : 'display:none')
        .replace(/\{\{EDIT_BUTTON\}\}/g, editBtn)
        .replace(/\{\{CREATE_BANNER\}\}/g, createBanner)
        .replace(/\{\{PROFILE_BIO\}\}/g, bioHtml)
        .replace(/\{\{VIEWS\}\}/g, viewsCount)
        .replace(/\{\{MUSIC_AUTO_PLAY\}\}/g, musicAutoPlay);


    res.send(template);
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at: ${BASE_URL}`);
    console.log(`📝 Create profile:    ${BASE_URL}/create\n`);
});
