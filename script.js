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
                observer.unobserve(entry.target); // Stop observing once revealed
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
        
        // Gentle parallax effect for background blobs
        if(blob1) {
            blob1.style.transform = `translate(${x * 0.02}px, ${y * 0.02}px)`;
        }
        if(blob2) {
            blob2.style.transform = `translate(${x * -0.02}px, ${y * -0.02}px)`;
        }
    });

    // Button click effects
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            let x = e.clientX - e.target.offsetLeft;
            let y = e.clientY - e.target.offsetTop;
            
            let ripples = document.createElement('span');
            ripples.style.left = x + 'px';
            ripples.style.top = y + 'px';
            ripples.style.position = 'absolute';
            ripples.style.background = 'rgba(255,255,255,0.3)';
            ripples.style.width = '10px';
            ripples.style.height = '10px';
            ripples.style.borderRadius = '50%';
            ripples.style.transform = 'translate(-50%, -50%)';
            ripples.style.animation = 'ripple 0.5s linear infinite';
            
            // Note: button needs position:relative and overflow:hidden for ripple
            // We'll just add a simple scale effect in CSS, but this is a nice JS addition if styled.
        });
    });
    // Music Player Logic
    const bgMusic = document.getElementById('bg-music');
    const musicBtn = document.getElementById('music-btn');
    const musicIcon = musicBtn ? musicBtn.querySelector('.icon') : null;
    const volumeSlider = document.getElementById('volume-slider');

    if (musicBtn && bgMusic) {
        // Set initial volume based on slider
        if (volumeSlider) {
            bgMusic.volume = volumeSlider.value;
            volumeSlider.addEventListener('input', (e) => {
                bgMusic.volume = e.target.value;
            });
        }

        // Auto-play if enabled (on first interaction to bypass browser policy)
        if (window.MUSIC_AUTO_PLAY === true) {
            const tryAutoPlay = () => {
                bgMusic.play().then(() => {
                    if (musicIcon) musicIcon.textContent = '⏸';
                    document.body.classList.add('music-active');
                    document.removeEventListener('click', tryAutoPlay);
                    document.removeEventListener('touchstart', tryAutoPlay);
                }).catch(() => {});
            };
            // Try immediately, fallback to first click
            bgMusic.play().then(() => {
                if (musicIcon) musicIcon.textContent = '⏸';
                document.body.classList.add('music-active');
            }).catch(() => {
                document.addEventListener('click', tryAutoPlay, { once: true });
                document.addEventListener('touchstart', tryAutoPlay, { once: true });
            });
        }

        musicBtn.addEventListener('click', () => {
            if (bgMusic.paused) {
                bgMusic.play();
                if (musicIcon) musicIcon.textContent = '⏸';
                document.body.classList.add('music-active');
            } else {
                bgMusic.pause();
                if (musicIcon) musicIcon.textContent = '▶';
                document.body.classList.remove('music-active');
            }
        });
    }
});

