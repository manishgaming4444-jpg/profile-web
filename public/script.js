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
    const bgMusic = document.getElementById('bg-music');
    const musicBtn = document.getElementById('music-btn');
    const musicIcon = musicBtn ? musicBtn.querySelector('.icon') : null;
    const volumeSlider = document.getElementById('volume-slider');

    // Create "Tap to Play" toast
    function createMusicToast() {
        if (document.getElementById('music-toast')) return;
        const style = document.createElement('style');
        style.textContent = `
            @keyframes musicToastIn { from{opacity:0;transform:translateX(-50%) translateY(20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
            @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(138,43,226,0.7)} 70%{box-shadow:0 0 0 14px rgba(138,43,226,0)} 100%{box-shadow:0 0 0 0 rgba(138,43,226,0)} }
        `;
        document.head.appendChild(style);

        const toast = document.createElement('div');
        toast.id = 'music-toast';
        toast.innerHTML = '🎵 Tap anywhere to play music';
        toast.style.cssText = `
            position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
            background:rgba(10,10,20,0.92); backdrop-filter:blur(14px);
            color:#fff; padding:12px 28px; border-radius:50px;
            font-family:'Outfit',sans-serif; font-size:0.88rem; font-weight:600;
            border:1px solid rgba(138,43,226,0.4); z-index:9999;
            animation:musicToastIn 0.4s ease;
            box-shadow:0 8px 32px rgba(138,43,226,0.35);
            cursor:pointer; user-select:none; letter-spacing:0.3px;
        `;
        document.body.appendChild(toast);
        return toast;
    }

    function removeMusicToast() {
        const t = document.getElementById('music-toast');
        if (t) t.remove();
    }

    if (musicBtn && bgMusic) {
        if (volumeSlider) {
            bgMusic.volume = volumeSlider.value;
            volumeSlider.addEventListener('input', (e) => {
                bgMusic.volume = e.target.value;
            });
        }

        function startMusic() {
            bgMusic.play().then(() => {
                if (musicIcon) musicIcon.textContent = '\u23f8';
                document.body.classList.add('music-active');
                removeMusicToast();
                if (musicBtn) musicBtn.style.animation = '';
            }).catch(() => {});
        }

        // Auto-play if enabled by owner
        if (window.MUSIC_AUTO_PLAY === true) {
            bgMusic.play().then(() => {
                if (musicIcon) musicIcon.textContent = '\u23f8';
                document.body.classList.add('music-active');
            }).catch(() => {
                // Browser blocked autoplay — show toast & pulse button
                createMusicToast();
                if (musicBtn) musicBtn.style.animation = 'pulse 1.5s infinite';

                const onInteract = () => {
                    startMusic();
                    document.removeEventListener('click', onInteract);
                    document.removeEventListener('touchstart', onInteract);
                };
                document.addEventListener('click', onInteract);
                document.addEventListener('touchstart', onInteract);
            });
        }

        // Manual play/pause toggle
        musicBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (bgMusic.paused) {
                bgMusic.play();
                if (musicIcon) musicIcon.textContent = '\u23f8';
                document.body.classList.add('music-active');
                removeMusicToast();
            } else {
                bgMusic.pause();
                if (musicIcon) musicIcon.textContent = '\u25b6';
                document.body.classList.remove('music-active');
            }
        });
    }
});
