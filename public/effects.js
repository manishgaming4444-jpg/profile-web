// ─── BACKGROUND EFFECTS ENGINE ────────────────────────────────
(function() {
    const effect = window.BG_EFFECT || 'none';
    if (effect === 'none') return;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-effect-canvas';
    canvas.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        z-index:0; pointer-events:none; opacity:0.75;
    `;
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── 1. AURORA ─────────────────────────────────────────────
    function runAurora() {
        const waves = Array.from({length: 5}, (_, i) => ({
            offset: Math.random() * Math.PI * 2,
            speed:  0.0004 + Math.random() * 0.0003,
            amp:    80 + Math.random() * 120,
            y:      canvas.height * (0.2 + i * 0.13),
            hue:    200 + i * 30,
        }));
        let t = 0;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            waves.forEach(w => {
                ctx.beginPath();
                ctx.moveTo(0, w.y);
                for (let x = 0; x <= canvas.width; x += 6) {
                    const y = w.y + Math.sin(x * 0.007 + t * w.speed * 1000 + w.offset) * w.amp
                                  + Math.sin(x * 0.003 + t * w.speed * 600)  * (w.amp * 0.4);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(canvas.width, canvas.height);
                ctx.lineTo(0, canvas.height);
                ctx.closePath();
                const grad = ctx.createLinearGradient(0, w.y - w.amp, 0, w.y + w.amp * 2);
                grad.addColorStop(0, `hsla(${w.hue},90%,60%,0)`);
                grad.addColorStop(0.4, `hsla(${w.hue},80%,50%,0.18)`);
                grad.addColorStop(1, `hsla(${w.hue + 40},70%,40%,0)`);
                ctx.fillStyle = grad;
                ctx.fill();
            });
            t = Date.now();
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── 2. SNOWFLAKES ──────────────────────────────────────────
    function runSnowflakes() {
        const flakes = Array.from({length: 160}, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: 1 + Math.random() * 3,
            speed: 0.5 + Math.random() * 1.5,
            drift: (Math.random() - 0.5) * 0.4,
            opacity: 0.4 + Math.random() * 0.6,
        }));
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            flakes.forEach(f => {
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${f.opacity})`;
                ctx.fill();
                f.y += f.speed;
                f.x += f.drift;
                if (f.y > canvas.height + 5) { f.y = -5; f.x = Math.random() * canvas.width; }
                if (f.x > canvas.width + 5)  { f.x = -5; }
                if (f.x < -5)                 { f.x = canvas.width + 5; }
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── 3. RAIN ────────────────────────────────────────────────
    function runRain() {
        const drops = Array.from({length: 220}, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            len: 12 + Math.random() * 22,
            speed: 8 + Math.random() * 10,
            opacity: 0.15 + Math.random() * 0.35,
        }));
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drops.forEach(d => {
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.len * 0.15, d.y + d.len);
                ctx.strokeStyle = `rgba(180,210,255,${d.opacity})`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
                d.y += d.speed;
                d.x -= d.speed * 0.15;
                if (d.y > canvas.height + d.len) {
                    d.y = -d.len;
                    d.x = Math.random() * canvas.width;
                }
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── 4. NIGHT SKY (stars + shooting stars) ─────────────────
    function runNightSky() {
        const stars = Array.from({length: 250}, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: 0.5 + Math.random() * 1.5,
            twinkle: Math.random() * Math.PI * 2,
            speed: 0.02 + Math.random() * 0.04,
        }));
        let shooters = [];
        function spawnShooter() {
            shooters.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * 0.5,
                len: 100 + Math.random() * 80,
                speed: 8 + Math.random() * 8,
                life: 1,
            });
        }
        setInterval(spawnShooter, 2200);
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach(s => {
                s.twinkle += s.speed;
                const a = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${a})`;
                ctx.fill();
            });
            shooters = shooters.filter(s => s.life > 0);
            shooters.forEach(s => {
                const grad = ctx.createLinearGradient(s.x, s.y, s.x + s.len, s.y + s.len * 0.5);
                grad.addColorStop(0, `rgba(255,255,255,0)`);
                grad.addColorStop(0.4, `rgba(255,255,255,${s.life * 0.8})`);
                grad.addColorStop(1, `rgba(255,255,255,0)`);
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.x + s.len, s.y + s.len * 0.5);
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                s.x += s.speed * 1.5;
                s.y += s.speed * 0.6;
                s.life -= 0.03;
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── 5. OLD TV (scanlines + noise) ─────────────────────────
    function runOldTV() {
        let offset = 0;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Scanlines
            for (let y = 0; y < canvas.height; y += 3) {
                ctx.fillStyle = `rgba(0,0,0,0.18)`;
                ctx.fillRect(0, y, canvas.width, 1);
            }
            // Noise
            const imageData = ctx.createImageData(canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const v = Math.random() > 0.97 ? 200 : 0;
                data[i] = data[i+1] = data[i+2] = v;
                data[i+3] = v ? 60 : 0;
            }
            ctx.putImageData(imageData, 0, 0);
            // Horizontal glitch line
            if (Math.random() > 0.93) {
                const gy = Math.random() * canvas.height;
                ctx.fillStyle = `rgba(255,255,255,0.04)`;
                ctx.fillRect(0, gy, canvas.width, 1 + Math.random() * 3);
            }
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── 6. FIREFLIES ──────────────────────────────────────────
    function runFireflies() {
        const flies = Array.from({length: 60}, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            r: 1.5 + Math.random() * 2,
            life: Math.random() * Math.PI * 2,
            speed: 0.02 + Math.random() * 0.03,
            hue: 80 + Math.random() * 60,
        }));
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            flies.forEach(f => {
                f.life += f.speed;
                const a = 0.3 + 0.7 * Math.abs(Math.sin(f.life));
                const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 6);
                glow.addColorStop(0, `hsla(${f.hue},100%,70%,${a})`);
                glow.addColorStop(1, `hsla(${f.hue},100%,70%,0)`);
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r * 6, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
                f.x += f.vx; f.y += f.vy;
                f.vx += (Math.random() - 0.5) * 0.05;
                f.vy += (Math.random() - 0.5) * 0.05;
                f.vx = Math.max(-1, Math.min(1, f.vx));
                f.vy = Math.max(-1, Math.min(1, f.vy));
                if (f.x < 0) f.x = canvas.width;
                if (f.x > canvas.width) f.x = 0;
                if (f.y < 0) f.y = canvas.height;
                if (f.y > canvas.height) f.y = 0;
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── Dispatch ───────────────────────────────────────────────
    const map = {
        aurora:    runAurora,
        snowflakes:runSnowflakes,
        rain:      runRain,
        nightsky:  runNightSky,
        oldtv:     runOldTV,
        fireflies: runFireflies,
    };
    if (map[effect]) map[effect]();
})();
