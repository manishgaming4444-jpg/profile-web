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
const { MongoStore } = require('connect-mongo');

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
    links: [{
        platform:  { type: String },
        label:     { type: String },
        url:       { type: String },
        color:     { type: String },
        tc:        { type: String },
        clicks:    { type: Number, default: 0 }
    }],
    photo:        { type: String, default: '' },
    song:         { type: String, default: '' },
    bgMedia:      { type: String, default: '' },
    bgMediaType:  { type: String, default: '' },
    customCursor: { type: String, default: '' },
    musicEnabled: { type: Boolean, default: false },
    nameFont:     { type: String, default: 'Outfit' },
    nameAnimation:{ type: String, default: 'none' },
    nameColor:    { type: String, default: '#ffffff' },
    bgEffect:     { type: String, default: 'none' },
    profileTheme: { type: String, default: 'default' },
    banned:       { type: Boolean, default: false },
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
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || (() => { console.warn('⚠️  SESSION_SECRET not set! Using insecure default.'); return 'xonpro-secret-change-me'; })(),
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 7 * 24 * 60 * 60,   // 7 days
        autoRemove: 'native'
    }),
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

        const currentLinksJson = JSON.stringify((existing && existing.links) ? existing.links : []);

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
            .replace(/\{\{EDIT_NAME_FONT\}\}/g,         (existing && existing.nameFont)      || 'Outfit')
            .replace(/\{\{EDIT_NAME_ANIMATION\}\}/g,    (existing && existing.nameAnimation) || 'none')
            .replace(/\{\{EDIT_NAME_COLOR\}\}/g,        (existing && existing.nameColor)     || '#ffffff')
            .replace(/\{\{EDIT_BG_EFFECT\}\}/g,         (existing && existing.bgEffect)      || 'none')
            .replace(/\{\{EDIT_PROFILE_THEME\}\}/g,     (existing && existing.profileTheme)  || 'default')
            .replace(/\{\{CURRENT_PHOTO_PREVIEW\}\}/g,  currentPhotoPreview)
            .replace(/\{\{CURRENT_SONG_PREVIEW\}\}/g,   currentSongPreview)
            .replace(/\{\{CURRENT_BG_PREVIEW\}\}/g,     currentBgPreview)
            .replace(/\{\{CURRENT_CURSOR_PREVIEW\}\}/g, currentCursorPreview)
            .replace(/\{\{CURRENT_LINKS_JSON\}\}/g,     currentLinksJson);


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

        const { displayname, bio, musicEnabled, nameFont, nameAnimation } = req.body;
        user.displayname  = displayname  || user.displayname;
        user.bio          = bio !== undefined ? bio.slice(0, 150) : (user.bio || '');
        if ('musicEnabled' in req.body) user.musicEnabled = musicEnabled === 'on';
        if (nameFont)      user.nameFont      = nameFont;
        if (nameAnimation) user.nameAnimation = nameAnimation;
        // Validate hex color before saving
        const hexColorRe = /^#[0-9A-Fa-f]{6}$/;
        if (req.body.nameColor && hexColorRe.test(req.body.nameColor)) {
            user.nameColor = req.body.nameColor;
        }
        if (req.body.bgEffect !== undefined) user.bgEffect = req.body.bgEffect || 'none';
        const validThemes = ['default','neon','retro','minimal','ocean'];
        if (req.body.profileTheme && validThemes.includes(req.body.profileTheme)) {
            user.profileTheme = req.body.profileTheme;
        }

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

// ─── LINKS UPDATE (JSON) ──────────────────────────────────────
app.post('/:username/links', isLoggedIn, async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        const user = await User.findOne({ username });
        if (!user)                                return res.status(404).json({ error: 'not found' });
        if (user.googleId !== req.user.googleId)  return res.status(403).json({ error: 'denied' });
        user.links = (req.body.links || []).slice(0, 20).filter(link => {
            try { return link.url && /^https?:\/\//.test(link.url) && new URL(link.url); }
            catch { return false; }
        });
        user.markModified('links');
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'server error' });
    }
});

// ─── PUBLIC EXPLORE / SEARCH ─────────────────────────────────
app.get('/explore', async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        const filter = q
            ? { $or: [{ username: new RegExp(q,'i') }, { displayname: new RegExp(q,'i') }] }
            : {};
        const profiles = await User.find(filter, 'username displayname photo views createdAt profileTheme')
            .sort({ views: -1 }).limit(60).lean();
        const exploreTemplate = fs.readFileSync(path.join(__dirname, 'views', 'explore.html'), 'utf-8');
        const cardsHtml = profiles.map(p => {
            const photo = p.photo
                ? `<img src="${p.photo}" alt="${p.displayname}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.15);">`
                : `<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#8a2be2,#ff007f);display:flex;align-items:center;justify-content:center;font-size:1.8rem;">👤</div>`;
            return `<a href="/${p.username}" class="explore-card">${photo}<div class="ec-name">${p.displayname}</div><div class="ec-user">@${p.username}</div><div class="ec-views">👁️ ${(p.views||0).toLocaleString('en-IN')}</div></a>`;
        }).join('');
        const html = exploreTemplate
            .replace('{{SEARCH_QUERY}}', q)
            .replace('{{EXPLORE_CARDS}}', cardsHtml || '<div class="ec-empty">No profiles found.</div>')
            .replace('{{PROFILE_COUNT}}', profiles.length);
        res.send(html);
    } catch(err) { console.error(err); res.status(500).send('Server error.'); }
});

// ─── LINK CLICK TRACKING ──────────────────────────────────────
app.get('/:username/link/:idx/click', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        const idx = parseInt(req.params.idx, 10);
        const user = await User.findOne({ username });
        if (!user || isNaN(idx) || idx < 0 || idx >= user.links.length) {
            return res.redirect('/');
        }
        const targetUrl = user.links[idx].url;
        // Increment click count atomically
        await User.findOneAndUpdate(
            { username, [`links.${idx}`]: { $exists: true } },
            { $inc: { [`links.${idx}.clicks`]: 1 } }
        );
        res.redirect(targetUrl);
    } catch(err) { res.redirect('/'); }
});

// ─── SECRET ADMIN PANEL (BEFORE /:username catch-all!) ────────────────
const ADMIN_SECRET   = process.env.ADMIN_SECRET || 'xonpro-admin-2024';
const ADMIN_SESS_KEY = 'xonAdminAuth';

function isAdmin(req, res, next) {
    if (req.session && req.session[ADMIN_SESS_KEY]) return next();
    res.redirect('/xon-admin-secret');
}

app.get('/xon-admin-secret', (req, res) => {
    if (req.session && req.session[ADMIN_SESS_KEY]) return res.redirect('/xon-admin-panel');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#08080a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{background:#111114;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:2.5rem;width:320px;text-align:center}
    h2{font-size:1.4rem;margin-bottom:.3rem}p{color:rgba(255,255,255,.35);font-size:.85rem;margin-bottom:1.8rem}
    input{width:100%;padding:.75rem 1rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:1rem;margin-bottom:1rem;outline:none}
    button{width:100%;padding:.8rem;background:linear-gradient(135deg,#8a2be2,#c026d3);border:none;border-radius:10px;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}
    .err{color:#ff6b6b;font-size:.82rem;margin-top:.5rem}</style></head>
    <body><div class="box"><h2>&#x1F510; Admin Access</h2><p>Enter secret password</p>
    <form method="POST"><input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Login</button>${req.query.err ? '<div class="err">&#x274C; Wrong password</div>' : ''}</form></div></body></html>`);
});

app.post('/xon-admin-secret', express.urlencoded({ extended: false }), (req, res) => {
    if (req.body.password === ADMIN_SECRET) { req.session[ADMIN_SESS_KEY] = true; return res.redirect('/xon-admin-panel'); }
    res.redirect('/xon-admin-secret?err=1');
});

app.get('/xon-admin-panel', isAdmin, async (req, res) => {
    try {
        const users = await User.find({}, 'username displayname photo views banned createdAt googleEmail').sort({ createdAt: -1 }).lean();
        const totalViews = users.reduce((s, u) => s + (u.views || 0), 0);
        const rows = users.map((u, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><div style="display:flex;align-items:center;gap:.6rem;">
                    ${u.photo ? `<img src="${u.photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">` : '<div style="width:32px;height:32px;border-radius:50%;background:#8a2be2;display:flex;align-items:center;justify-content:center;">&#x1F464;</div>'}
                    <div><div style="font-weight:600;font-size:.88rem;">@${u.username}</div><div style="font-size:.72rem;color:rgba(255,255,255,.35);">${u.displayname}</div></div></div></td>
                <td style="font-size:.8rem;color:rgba(255,255,255,.4);">${u.googleEmail || '&#x2014;'}</td>
                <td style="text-align:center;">${(u.views || 0).toLocaleString()}</td>
                <td style="text-align:center;"><span style="padding:.2rem .7rem;border-radius:20px;font-size:.72rem;font-weight:700;background:${u.banned ? 'rgba(255,60,60,.15)' : 'rgba(0,200,0,.1)'};color:${u.banned ? '#ff6b6b' : '#4ade80'};">${u.banned ? '&#x1F6AB; Banned' : '&#x2705; Active'}</span></td>
                <td><div style="display:flex;gap:.4rem;">
                    <a href="/${u.username}" target="_blank" style="padding:.3rem .7rem;background:rgba(255,255,255,.06);border-radius:7px;color:#fff;text-decoration:none;font-size:.78rem;">&#x1F517;</a>
                    <form method="POST" action="/xon-admin-ban" style="display:inline;">
                        <input type="hidden" name="username" value="${u.username}"><input type="hidden" name="action" value="${u.banned ? 'unban' : 'ban'}">
                        <button type="submit" style="padding:.3rem .7rem;background:${u.banned ? 'rgba(0,200,0,.1)' : 'rgba(255,150,0,.1)'};border:1px solid ${u.banned ? 'rgba(0,200,0,.25)' : 'rgba(255,150,0,.25)'};border-radius:7px;color:${u.banned ? '#4ade80' : '#fb923c'};cursor:pointer;font-size:.78rem;">${u.banned ? 'Unban' : 'Ban'}</button>
                    </form>
                    <form method="POST" action="/xon-admin-delete" style="display:inline;" onsubmit="return confirm('Delete @${u.username}?')">
                        <input type="hidden" name="username" value="${u.username}">
                        <button type="submit" style="padding:.3rem .7rem;background:rgba(255,60,60,.1);border:1px solid rgba(255,60,60,.25);border-radius:7px;color:#ff6b6b;cursor:pointer;font-size:.78rem;">&#x1F5D1;&#xFE0F;</button>
                    </form>
                </div></td>
            </tr>`).join('');
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Panel</title>
        <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#08080a;color:#fff;min-height:100vh}
        .topbar{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;background:#0d0d10;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;z-index:10;}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;padding:1.5rem 2rem;max-width:1100px;margin:0 auto;}
        .stat{background:#111114;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:1.2rem 1.5rem;}
        .stat-val{font-size:2rem;font-weight:800;}.stat-lbl{font-size:.8rem;color:rgba(255,255,255,.35);margin-top:.2rem;}
        .tw{max-width:1100px;margin:0 auto 2rem;padding:0 2rem;overflow-x:auto;}
        table{width:100%;border-collapse:collapse;background:#111114;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.07);}
        th{padding:.7rem .8rem;text-align:left;font-size:.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.3);background:#0d0d10;border-bottom:1px solid rgba(255,255,255,.06);}
        td{padding:.65rem .8rem;}tr:hover td{background:rgba(255,255,255,.02);}
        .logout{padding:.35rem 1rem;border:1px solid rgba(255,80,80,.3);border-radius:50px;color:#ff6b6b;text-decoration:none;font-size:.8rem;}</style></head>
        <body><div class="topbar"><span style="font-weight:700;font-size:1.1rem;">&#x1F510; XonPro Admin</span><a href="/xon-admin-logout" class="logout">&#x21E5; Logout</a></div>
        <div class="stats">
            <div class="stat"><div class="stat-val">${users.length}</div><div class="stat-lbl">Total Users</div></div>
            <div class="stat"><div class="stat-val">${totalViews.toLocaleString()}</div><div class="stat-lbl">Total Views</div></div>
            <div class="stat"><div class="stat-val">${users.filter(u=>u.banned).length}</div><div class="stat-lbl">Banned</div></div>
        </div>
        <div class="tw"><table><thead><tr><th>#</th><th>User</th><th>Email</th><th>Views</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody></table></div></body></html>`);
    } catch(err) { res.status(500).send('Server error'); }
});

app.post('/xon-admin-ban', isAdmin, express.urlencoded({ extended: false }), async (req, res) => {
    await User.updateOne({ username: req.body.username }, { banned: req.body.action === 'ban' });
    res.redirect('/xon-admin-panel');
});

app.post('/xon-admin-delete', isAdmin, express.urlencoded({ extended: false }), async (req, res) => {
    try {
        const u = await User.findOne({ username: req.body.username });
        if (u) {
            const assets = [{url:u.photo,type:'image'},{url:u.bgMedia,type:u.bgMediaType==='video'?'video':'image'},{url:u.customCursor,type:'image'},{url:u.song,type:'video'}].filter(a=>a.url);
            for (const a of assets) { try { const p=a.url.split('/'); await cloudinary.uploader.destroy(`${p[p.length-2]}/${p[p.length-1].split('.')[0]}`,{resource_type:a.type}); } catch(e){} }
            await User.deleteOne({ username: req.body.username });
        }
        res.redirect('/xon-admin-panel');
    } catch(err) { res.status(500).send('Error'); }
});

app.get('/xon-admin-logout', (req, res) => {
    if (req.session) req.session[ADMIN_SESS_KEY] = false;
    res.redirect('/xon-admin-secret');
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

        // Banned check — owner can still view their own profile
        const isOwnerVisit = req.isAuthenticated() && req.user.googleId === user.googleId;
        if (user.banned && !isOwnerVisit) {
            return res.status(403).send(`
                <html><body style="font-family:sans-serif;background:#050505;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
                    <div style="font-size:3rem;">🚫</div>
                    <h1 style="font-size:2rem;margin-top:1rem;">Account Suspended</h1>
                    <p style="color:rgba(255,255,255,0.4);margin-top:0.5rem;">This profile has been suspended.</p>
                    <a href="/explore" style="color:#8a2be2;margin-top:1.5rem;">← Explore other profiles</a>
                </body></html>`);
        }

        // Increment views atomically and get updated count
        const updated = await User.findByIdAndUpdate(
            user._id, { $inc: { views: 1 } }, { new: true }
        );
        const viewsCount = (updated.views || 1).toLocaleString('en-IN');

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
                    <button onclick="this.closest('#create-banner').style.cssText='opacity:0;pointer-events:none;height:0;padding:0;overflow:hidden;transition:all 0.3s ease'" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;margin-left:12px;opacity:0.7;line-height:1;padding:0 4px;transition:opacity 0.2s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Close">✕</button>
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

        // Body class for background media + theme
        const themeClass = `theme-${user.profileTheme || 'default'}`;
        const bodyClass = [user.bgMedia ? 'has-bg-media' : '', themeClass].filter(Boolean).join(' ');

        // Profile icon links — use /click redirect for analytics
        const profileLinksHtml = (user.links && user.links.length > 0)
            ? user.links.map((link, idx) => {
                const iconContent = link.platform === 'custom'
                    ? `<span style="font-size:1.4rem;line-height:1">🔗</span>`
                    : `<img src="https://cdn.simpleicons.org/${link.platform}/${(link.tc||'ffffff').replace('#','')}" alt="${link.label}" width="28" height="28" onerror="this.style.display='none'">`;
                return `<a href="/${user.username}/link/${idx}/click" class="plink" style="background:${link.color};--glow:${link.color}" target="_blank" rel="noopener noreferrer" title="${link.label}">${iconContent}</a>`;
              }).join('')
            : '';


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
            .replace(/\{\{BODY_CLASS\}\}/g,         bodyClass)
            .replace(/\{\{PROFILE_LINKS\}\}/g,      profileLinksHtml)
            .replace(/\{\{NAME_FONT_CSS\}\}/g,      (user.nameFont || 'Outfit'))
            .replace(/\{\{NAME_FONT_URL\}\}/g,      (user.nameFont || 'Outfit').replace(/ /g, '+'))
            .replace(/\{\{NAME_ANIMATION\}\}/g,     user.nameAnimation || 'none')
            .replace(/\{\{NAME_COLOR\}\}/g,          user.nameColor     || '#ffffff')
            .replace(/\{\{BG_EFFECT\}\}/g,           user.bgEffect      || 'none')
            .replace(/\{\{PROFILE_THEME\}\}/g,       user.profileTheme  || 'default')
            .replace(/\{\{SONG_EXISTS\}\}/g,        user.song ? 'true' : 'false');



        res.send(template);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error.');
    }
});

// ─── DELETE ACCOUNT ──────────────────────────────────────────
app.delete('/account/delete', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Not logged in' });
    try {
        const user = await User.findOne({ googleId: req.user.googleId });
        if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

        // Delete Cloudinary assets
        const extractPublicId = (url) => {
            if (!url) return null;
            const parts = url.split('/');
            const file = parts[parts.length - 1];
            const folder = parts[parts.length - 2];
            const nameOnly = file.split('.')[0];
            return `${folder}/${nameOnly}`;
        };

        const toDelete = [
            { url: user.photo,        type: 'image' },
            { url: user.bgMedia,      type: user.bgMediaType === 'video' ? 'video' : 'image' },
            { url: user.customCursor, type: 'image' },
            { url: user.song,         type: 'video' },  // audio stored as video in cloudinary
        ].filter(a => a.url);

        for (const asset of toDelete) {
            try {
                const pid = extractPublicId(asset.url);
                if (pid) await cloudinary.uploader.destroy(pid, { resource_type: asset.type });
            } catch(e) { /* ignore cloudinary errors */ }
        }

        // Delete from MongoDB
        await User.deleteOne({ googleId: req.user.googleId });

        // Logout session
        req.logout(() => {
            req.session.destroy(() => {
                res.json({ ok: true });
            });
        });
    } catch (err) {
        console.error('Delete account error:', err);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});


// Ban / Unban
app.post('/xon-admin-ban', isAdmin, express.urlencoded({ extended: false }), async (req, res) => {
    await User.updateOne({ username: req.body.username }, { banned: req.body.action === 'ban' });
    res.redirect('/xon-admin-panel');
});

// Admin Delete User
app.post('/xon-admin-delete', isAdmin, express.urlencoded({ extended: false }), async (req, res) => {
    try {
        const u = await User.findOne({ username: req.body.username });
        if (u) {
            const assets = [{ url:u.photo,type:'image'},{url:u.bgMedia,type:u.bgMediaType==='video'?'video':'image'},{url:u.customCursor,type:'image'},{url:u.song,type:'video'}].filter(a=>a.url);
            for (const a of assets) { try { const p=a.url.split('/'); await cloudinary.uploader.destroy(`${p[p.length-2]}/${p[p.length-1].split('.')[0]}`,{resource_type:a.type}); } catch(e){} }
            await User.deleteOne({ username: req.body.username });
        }
        res.redirect('/xon-admin-panel');
    } catch(err) { res.status(500).send('Error'); }
});

// Admin Logout
app.get('/xon-admin-logout', (req, res) => {
    if (req.session) req.session[ADMIN_SESS_KEY] = false;
    res.redirect('/xon-admin-secret');
});

// ─── MULTER ERROR HANDLER ────────────────────────────────────
app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).send(`
            <html><body style="font-family:sans-serif;background:#08080a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
                <h2>❌ File Too Large</h2>
                <p>Maximum file size is 20MB. Please upload a smaller file.</p>
                <a href="/dashboard" style="color:#8a2be2;margin-top:1rem;">← Back to Dashboard</a>
            </body></html>`);
    }
    next(err);
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at: ${BASE_URL}`);
    console.log(`📝 Create profile:    ${BASE_URL}/create\n`);
});
