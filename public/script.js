document.addEventListener('DOMContentLoaded', () => {
    // Scroll Reveal Animation with Intersection Observer
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const hiddenElements = document.querySelectorAll('.hidden, .hidden-delayed');
    hiddenElements.forEach(el => observer.observe(el));

    // Interactive Background Blobs
    const blob1 = document.querySelector('.blob-1');
    const blob2 = document.querySelector('.blob-2');

    window.addEventListener('mousemove', (e) => {
        const x = e.clientX;
        const y = e.clientY;
        if(blob1) blob1.style.transform = `translate(${x * 0.02}px, ${y * 0.02}px)`;
        if(blob2) blob2.style.transform = `translate(${x * -0.02}px, ${y * -0.02}px)`;
    });

    // ─── MUSIC PLAYER LOGIC ───────────────────────────────────────
    const bgMusic   = document.getElementById('bg-music');
    const musicBtn  = document.getElementById('music-btn');
    const musicIcon = musicBtn ? musicBtn.querySelector('.icon') : null;
    const volumeSlider = document.getElementById('volume-slider');
    const splash    = document.getElementById('splash-overlay');

    function startMusic() {
        if (!bgMusic) return;
        bgMusic.play().then(() => {
            if (musicIcon) musicIcon.textContent = '\u23f8';
            document.body.classList.add('music-active');
        }).catch(() => {});
    }

    function dismissSplash() {
        if (!splash) return;
        splash.classList.add('hide');
        setTimeout(() => splash.remove(), 850);
    }

    // Volume slider
    if (volumeSlider && bgMusic) {
        bgMusic.volume = volumeSlider.value;
        volumeSlider.addEventListener('input', (e) => {
            bgMusic.volume = e.target.value;
        });
    }

    // ── Splash click handler ──────────────────────────────────────
    if (splash) {
        splash.addEventListener('click', () => {
            dismissSplash();
            // Play music if song exists and auto-play is on
            if (window.HAS_SONG && window.MUSIC_AUTO_PLAY) {
                startMusic();
            }
        });
    } else {
        // No splash — fall back to old silent auto-play on first interaction
        if (bgMusic && window.MUSIC_AUTO_PLAY && window.HAS_SONG) {
            bgMusic.play().catch(() => {
                const onInteract = () => {
                    startMusic();
                    document.removeEventListener('click', onInteract);
                    document.removeEventListener('touchstart', onInteract);
                };
                document.addEventListener('click', onInteract);
                document.addEventListener('touchstart', onInteract);
            });
        }
    }

    // Manual play/pause toggle button
    if (musicBtn && bgMusic) {
        musicBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (bgMusic.paused) {
                bgMusic.play();
                if (musicIcon) musicIcon.textContent = '\u23f8';
                document.body.classList.add('music-active');
            } else {
                bgMusic.pause();
                if (musicIcon) musicIcon.textContent = '\u25b6';
                document.body.classList.remove('music-active');
            }
        });
    }
});
