require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const session  = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app      = express();
const PORT     = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).trim();

// ─── MONGODB ──────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err));

// ─── USER SCHEMA ─────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    username:     { type: String, unique: true, lowercase: true, required: true, trim: true },
    displayname:  { type: String, required: true },
    bio:          { type: String, default: '' },
    googleId:     { type: String, required: true, unique: true },
    googleEmail:  { type: String },
    instagram:    { type: String, default: '' },
    discord:      { type: String, default: '' },
    youtube:      { type: String, default: '' },
    photo:        { type: String, default: '' },   // Cloudinary URL
    song:         { type: String, default: '' },   // Cloudinary URL
    bgMedia:      { type: String, default: '' },   // Background image/video URL
    bgMediaType:  { type: String, default: '' },   // 'image' or 'video'
    customCursor: { type: String, default: '' },   // Custom cursor image URL
    musicEnabled: { type: Boolean, default: false },
    views:        { type: Number, default: 0 },
    createdAt:    { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ─── CLOUDINARY ───────────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const isAudio   = file.mimetype.startsWith('audio') || file.fieldname === 'song';
        const isBgVideo = file.fieldname === 'bgMedia' && file.mimetype.startsWith('video');
        const isVideo   = isAudio || isBgVideo;
        const username  = (req.body && req.body.username) || (req.params && req.params.username) || 'unknown';
        return {
            folder:        `xonpro/${username}`,
            resource_type: isVideo ? 'video' : 'image',
            public_id:     file.fieldname,
            overwrite:     true,
        };
    }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });  // 20 MB max

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'xonpro-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// ─── PASSPORT GOOGLE ─────────────────────────────────────────
passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  `${BASE_URL}/auth/google/callback`
}, (accessToken, refreshToken, profile, done) => {
    return done(null, {
        googleId: profile.id,
        email:    profile.emails[0].value,
        name:     profile.displayName
    });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/auth/google');
}

// ─── AUTH ROUTES ─────────────────────────────────────────────
app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'], prompt: 'select_account'
}));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/create' }),
    (req, res) => res.redirect('/dashboard')
);

app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// ─── HOME ────────────────────────────────────────────────────
app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.redirect('/create');
});

// ─── DASHBOARD ───────────────────────────────────────────────
app.get('/dashboard', isLoggedIn, async (req, res) => {
    try {
        const existing      = await User.findOne({ googleId: req.user.googleId });
        const dashTemplate  = fs.readFileSync(path.join(__dirname, 'views', 'dashboard.html'), 'utf-8');
        const avatarLetter  = (req.user.name || req.user.email || 'U')[0].toUpperCase();
        const usernameLink  = existing ? existing.username : '';

        let dashboardContent = '';
        let editDisplayname = '', editBio = '', editInstagram = '',
            editDiscord = '', editYoutube = '', editMusicEnabled = '';
        let currentPhotoPreview = '', currentSongPreview = '',
            currentBgPreview = '', currentCursorPreview = '';

        if (existing) {
            const profileUrl = `xonpro.store/${existing.username}`;
            const createdAt  = existing.createdAt
                ? new Date(existing.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'N/A';

            editDisplayname  = existing.displayname || '';
            editBio          = existing.bio          || '';
            editInstagram    = existing.instagram    || '';
            editDiscord      = existing.discord      || '';
            editYoutube      = existing.youtube      || '';
            editMusicEnabled = existing.musicEnabled ? 'checked' : '';

            currentPhotoPreview = existing.photo
                ? `<div class="current-media"><img src="${existing.photo}" alt="Current photo"> <span>Current photo</span></div>`
                : '';
            currentSongPreview = existing.song
                ? `<div class="current-media">🎵 <span>Current song uploaded</span></div>`
                : '';
            currentBgPreview = existing.bgMedia
                ? `<div class="current-media">${existing.bgMediaType === 'video' ? '🎬' : '🖼️'} <span>Current background uploaded</span></div>`
                : '';
            currentCursorPreview = existing.customCursor
                ? `<div class="current-media">🖱️ <span>Custom cursor uploaded</span></div>`
                : '';

            dashboardContent = `
            <div class="card card-hero">
                <div class="hero-avatar-wrap">
                    ${ existing.photo
                        ? `<img src="${existing.photo}" alt="Profile" class="hero-avatar">`
                        : `<div class="hero-avatar-placeholder">👤</div>` }
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
            <div class="card">
                <div class="clabel">Profile Link</div>
                <div class="url-box">
                    <div class="url-live"></div>
                    <span class="url-text" id="profile-url">https://${profileUrl}</span>
                    <button class="url-copy" id="copy-btn" onclick="copyUrl()">Copy</button>
                </div>
                <p style="font-size:0.75rem;color:rgba(255,255,255,0.2);margin-top:0.3rem;">Yahi link share karo apne dosto ke saath!</p>
            </div>
            <div class="card" style="grid-column:span 2;">
                <div class="clabel">Account Info</div>
                <div class="info-row"><span class="info-key">Display Name</span><span class="info-val">${existing.displayname}</span></div>
                <div class="info-row"><span class="info-key">Username</span><span class="info-val">@${existing.username}</span></div>
                <div class="info-row"><span class="info-key">Google Email</span><span class="info-val">${req.user.email}</span></div>
                <div class="info-row"><span class="info-key">Profile Created</span><span class="info-val">${createdAt}</span></div>
            </div>`;
        } else {
            dashboardContent = `
            <div class="card no-profile-card">
                <div class="big-emoji">🚀</div>
                <h2>Abhi tak koi profile nahi bana!</h2>
                <p>Apna premium profile page abhi banao — bilkul free mein.</p>
                <a href="/create" class="btn-white">✨ Create My Profile</a>
            </div>`;
        }

        const html = dashTemplate
            .replace(/\{\{AVATAR_LETTER\}\}/g,         avatarLetter)
            .replace(/\{\{GOOGLE_EMAIL\}\}/g,           req.user.email || '')
            .replace(/\{\{GOOGLE_NAME\}\}/g,            req.user.name  || 'User')
            .replace(/\{\{USERNAME_LINK\}\}/g,          usernameLink)
            .replace(/\{\{DASHBOARD_CONTENT\}\}/g,      dashboardContent)
            .replace(/\{\{EDIT_DISPLAYNAME\}\}/g,       editDisplayname)
            .replace(/\{\{EDIT_BIO\}\}/g,               editBio)
            .replace(/\{\{EDIT_INSTAGRAM\}\}/g,         editInstagram)
            .replace(/\{\{EDIT_DISCORD\}\}/g,           editDiscord)
            .replace(/\{\{EDIT_YOUTUBE\}\}/g,           editYoutube)
            .replace(/\{\{EDIT_MUSIC_ENABLED\}\}/g,     editMusicEnabled)
            .replace(/\{\{CURRENT_PHOTO_PREVIEW\}\}/g,  currentPhotoPreview)
            .replace(/\{\{CURRENT_SONG_PREVIEW\}\}/g,   currentSongPreview)
            .replace(/\{\{CURRENT_BG_PREVIEW\}\}/g,     currentBgPreview)
            .replace(/\{\{CURRENT_CURSOR_PREVIEW\}\}/g, currentCursorPreview);


        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error.');
    }
});

// ─── CREATE ───────────────────────────────────────────────────
app.get('/create', async (req, res) => {
    if (!req.isAuthenticated()) return res.sendFile(path.join(__dirname, 'views', 'login.html'));
    try {
        const existing = await User.findOne({ googleId: req.user.googleId });
        if (existing) return res.redirect(`/${existing.username}`);
    } catch (_) {}
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

app.post('/create', isLoggedIn, upload.fields([
    { name: 'photo',        maxCount: 1 },
    { name: 'song',         maxCount: 1 },
    { name: 'bgMedia',      maxCount: 1 },
    { name: 'customCursor', maxCount: 1 }
]), async (req, res) => {
    try {
        const existing = await User.findOne({ googleId: req.user.googleId });
        if (existing) return res.redirect(`/${existing.username}`);

        const { username, displayname, bio, instagram, discord, youtube } = req.body;

        if (!username || !/^[a-z0-9_]{2,20}$/.test(username)) {
            return res.status(400).send('Invalid username.');
        }

        const taken = await User.findOne({ username });
        if (taken) return res.redirect(`/create?error=taken&username=${encodeURIComponent(username)}`);

        const photoUrl      = req.files['photo']        ? req.files['photo'][0].path        : '';
        const songUrl        = req.files['song']         ? req.files['song'][0].path         : '';
        const bgMediaUrl     = req.files['bgMedia']      ? req.files['bgMedia'][0].path      : '';
        const bgMediaType    = req.files['bgMedia']
            ? (req.files['bgMedia'][0].mimetype.startsWith('video') ? 'video' : 'image') : '';
        const customCursorUrl = req.files['customCursor'] ? req.files['customCursor'][0].path : '';

        await User.create({
            username,
            displayname:  displayname || username,
            bio:          bio         || '',
            googleId:     req.user.googleId,
            googleEmail:  req.user.email,
            instagram:    instagram   || '',
            discord:      discord     || '',
            youtube:      youtube     || '',
            photo:        photoUrl,
            song:         songUrl,
            bgMedia:      bgMediaUrl,
            bgMediaType:  bgMediaType,
            customCursor: customCursorUrl,
            views:        0
        });

        res.redirect('/dashboard?saved=1');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// ─── EDIT ─────────────────────────────────────────────────────
app.get('/:username/edit', isLoggedIn, (req, res) => res.redirect('/dashboard#edit'));

app.post('/:username/edit', isLoggedIn, upload.fields([
    { name: 'photo',        maxCount: 1 },
    { name: 'song',         maxCount: 1 },
    { name: 'bgMedia',      maxCount: 1 },
    { name: 'customCursor', maxCount: 1 }
]), async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        const user = await User.findOne({ username });
        if (!user)                                  return res.status(404).send('Profile not found.');
        if (user.googleId !== req.user.googleId)    return res.status(403).send('Access denied.');

        const { displayname, bio, instagram, discord, youtube, musicEnabled } = req.body;
        user.displayname  = displayname || user.displayname;
        user.bio          = bio !== undefined ? bio : (user.bio || '');
        user.instagram    = instagram   || user.instagram;
        user.discord      = discord     || user.discord;
        user.youtube      = youtube     || user.youtube;
        user.musicEnabled = musicEnabled === 'on';

        if (req.files['photo'])        user.photo        = req.files['photo'][0].path;
        if (req.files['song'])          user.song         = req.files['song'][0].path;
        if (req.files['bgMedia']) {
            user.bgMedia     = req.files['bgMedia'][0].path;
            user.bgMediaType = req.files['bgMedia'][0].mimetype.startsWith('video') ? 'video' : 'image';
        }
        if (req.files['customCursor']) user.customCursor = req.files['customCursor'][0].path;

        await user.save();
        res.redirect('/dashboard?saved=1');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// ─── PUBLIC PROFILE ───────────────────────────────────────────
app.get('/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).send(`
                <html><body style="font-family:sans-serif;background:#050505;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <h1 style="font-size:3rem;">404</h1>
                    <p>Profile <b>${username}</b> not found.</p>
                    <a href="/create" style="color:#8a2be2;margin-top:1rem;">Create your profile →</a>
                </body></html>`);
        }

        // Increment views atomically
        await User.findByIdAndUpdate(user._id, { $inc: { views: 1 } });
        const viewsCount = ((user.views || 0) + 1).toLocaleString('en-IN');

        let template = fs.readFileSync(path.join(__dirname, 'template', 'profile.html'), 'utf-8');

        const photoUrl      = user.photo || '/public/default-avatar.png';
        const songUrl       = user.song  || '';
        const songHidden    = songUrl ? '' : 'style="display:none"';
        const musicAutoPlay = (user.musicEnabled && songUrl) ? 'true' : 'false';
        const bioHtml       = user.bio
            ? `<p class="profile-bio">${user.bio.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`
            : '';

        const isOwner = req.isAuthenticated() && req.user.googleId === user.googleId;
        const editBtn = isOwner
            ? `<a href="/dashboard#edit" class="edit-profile-btn">✏️ Edit Profile</a>`
            : '';

        const visitorHasProfile = req.isAuthenticated()
            ? await User.findOne({ googleId: req.user.googleId })
            : null;
        const createBanner = (!isOwner && !visitorHasProfile)
            ? `<div class="create-banner" id="create-banner">
                    <span>✨ <strong>${user.displayname}</strong> ka profile dekh rahe ho? Apna bhi banao!</span>
                    <a href="/create">Free mein banao →</a>
               </div>`
            : '';

        // Background media element
        let bgMediaElement = '';
        if (user.bgMedia && user.bgMediaType === 'video') {
            bgMediaElement = `<video autoplay muted loop playsinline class="bg-video"><source src="${user.bgMedia}" type="video/mp4"></video>`;
        } else if (user.bgMedia && user.bgMediaType === 'image') {
            bgMediaElement = `<div class="bg-image" style="background-image:url('${user.bgMedia}')"></div>`;
        }

        // Custom cursor style
        const cursorStyle = user.customCursor
            ? `<style>*{cursor:url('${user.customCursor}') 16 16,auto!important;}</style>`
            : '';

        // Body class for background media
        const bodyClass = user.bgMedia ? 'has-bg-media' : '';

        template = template
            .replace(/\{\{USERNAME\}\}/g,           user.username)
            .replace(/\{\{DISPLAYNAME\}\}/g,        user.displayname)
            .replace(/\{\{PHOTO_URL\}\}/g,          photoUrl)
            .replace(/\{\{SONG_URL\}\}/g,           songUrl)
            .replace(/\{\{SONG_HIDDEN\}\}/g,        songHidden)
            .replace(/\{\{INSTAGRAM\}\}/g,          user.instagram || '#')
            .replace(/\{\{DISCORD\}\}/g,            user.discord   || '#')
            .replace(/\{\{YOUTUBE\}\}/g,            user.youtube   || '#')
            .replace(/\{\{INSTAGRAM_VISIBLE\}\}/g,  user.instagram ? '' : 'display:none')
            .replace(/\{\{DISCORD_VISIBLE\}\}/g,    user.discord   ? '' : 'display:none')
            .replace(/\{\{YOUTUBE_VISIBLE\}\}/g,    user.youtube   ? '' : 'display:none')
            .replace(/\{\{EDIT_BUTTON\}\}/g,        editBtn)
            .replace(/\{\{CREATE_BANNER\}\}/g,      createBanner)
            .replace(/\{\{PROFILE_BIO\}\}/g,        bioHtml)
            .replace(/\{\{VIEWS\}\}/g,              viewsCount)
            .replace(/\{\{MUSIC_AUTO_PLAY\}\}/g,    musicAutoPlay)
            .replace(/\{\{BG_MEDIA_ELEMENT\}\}/g,   bgMediaElement)
            .replace(/\{\{CUSTOM_CURSOR_STYLE\}\}/g, cursorStyle)
            .replace(/\{\{BODY_CLASS\}\}/g,         bodyClass);


        res.send(template);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error.');
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at: ${BASE_URL}`);
    console.log(`📝 Create profile:    ${BASE_URL}/create\n`);
});
