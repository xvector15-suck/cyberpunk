/* ==============================================
   CipherVault — Interactive Frontend Logic
   ==============================================
   Handles:
   1. Loading overlay
   2. Background particle canvas
   3. Hero text scramble (per-letter)
   4. Mouse 3D parallax on hero title
   5. Scroll-driven title shrink + content reveal
   6. Navbar scroll behaviour
   7. Section reveal on scroll
   8. Terminal encrypt simulation
   9. Image scanner flow
   10. Receiver authentication sequence
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ── 1. Loading Overlay ──────────────────────────
  const loaderOverlay = document.getElementById('loader-overlay');
  const loaderText    = document.getElementById('loader-text');
  const loaderMsgs    = [
    'Initializing Vault...',
    'Establishing secure channel...',
    'Loading encryption modules...',
    'Ready.'
  ];
  let msgIdx = 0;
  const loaderInterval = setInterval(() => {
    msgIdx++;
    if (msgIdx < loaderMsgs.length) {
      loaderText.textContent = loaderMsgs[msgIdx];
    }
    if (msgIdx >= loaderMsgs.length) {
      clearInterval(loaderInterval);
      setTimeout(() => {
        loaderOverlay.classList.add('hidden');
        // Begin hero scramble after loader fades
        startHeroScramble();
      }, 300);
    }
  }, 600);


  // ── 2. Background Particle Canvas ───────────────
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];
  const PARTICLE_COUNT = 70;
  const CONNECTION_DIST = 150;

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  /** Create a particle */
  function createParticle() {
    return {
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r:  Math.random() * 1.5 + 0.4,
      alpha: Math.random() * 0.35 + 0.08,
    };
  }
  function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(createParticle());
  }
  initParticles();

  /** Particle draw loop */
  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 229, 255, ${p.alpha})`;
      ctx.fill();
    }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DIST) {
          const opacity = (1 - dist / CONNECTION_DIST) * 0.1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0, 229, 255, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(drawParticles);
  }
  drawParticles();


  // ── 3. Hero Text Scramble (per-letter) ──────────
  const heroTitle = document.getElementById('hero-title');
  const letters   = heroTitle.querySelectorAll('.letter');
  const finalText = 'CipherVault';
  const scrambleChars = '!@#$%^&*_+-={}|;:<>?0123456789ABCDEF';

  /** Scramble animation: each letter resolves sequentially */
  function startHeroScramble() {
    let iteration = 0;
    const interval = setInterval(() => {
      letters.forEach((span, idx) => {
        if (idx < iteration) {
          span.textContent = finalText[idx];
        } else {
          span.textContent = scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
        }
      });
      iteration += 0.5; // half-step for smoother reveal
      if (iteration >= finalText.length) {
        clearInterval(interval);
        letters.forEach((span, idx) => {
          span.textContent = finalText[idx];
        });
      }
    }, 50);
  }


  // ── 4. Unified Hero Transform Engine ───────────
  //    Combines mouse parallax + scroll shrink into
  //    ONE rAF loop with ONE transform string.
  //    No competing loops, no jitter.

  const heroWrapper     = document.getElementById('hero-wrapper');
  const heroTagline     = document.getElementById('hero-tagline');
  const scrollIndicator = document.getElementById('scroll-indicator');

  // — Mouse state —
  let mouseTargetX  = 0;  // raw target from event (-1..1)
  let mouseTargetY  = 0;
  let mouseCurrentX = 0;  // lerp-smoothed current
  let mouseCurrentY = 0;

  // — Scroll state —
  let scrollTarget  = 0;  // raw scroll position from event
  let scrollCurrent = 0;  // lerp-smoothed current
  let scrollDist    = 1;  // wrapper scroll runway (set per frame)

  /** Store mouse target — event handler only, no DOM writes */
  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    mouseTargetX = (e.clientX - cx) / cx;   // -1..1
    mouseTargetY = (e.clientY - cy) / cy;
  });

  /** Store scroll target — event handler only, no DOM writes */
  window.addEventListener('scroll', () => {
    scrollTarget = window.scrollY;
  }, { passive: true });

  /**
   * Ease-out curve: fast response early, slow settling at end.
   * power=2.5 gives a premium deceleration feel.
   */
  function easeOutPow(t) {
    return 1 - Math.pow(1 - t, 2.5);
  }

  /**
   * Single rAF loop: lerp both inputs, apply ease-out curve,
   * compute one combined transform. Only transform + opacity.
   */
  function heroTransformLoop() {
    // ── Lerp smoothing ───────────────────────
    const mouseLerp  = 0.06;   // slow, cinematic mouse
    // Scroll lerp accelerates near end to settle before release
    const rawProgress0 = scrollDist > 0 ? scrollCurrent / scrollDist : 0;
    const nearEnd      = Math.max(0, Math.min(1, rawProgress0)) > 0.92;
    const scrollLerp   = nearEnd ? 0.18 : 0.08;

    mouseCurrentX += (mouseTargetX - mouseCurrentX) * mouseLerp;
    mouseCurrentY += (mouseTargetY - mouseCurrentY) * mouseLerp;
    scrollCurrent += (scrollTarget - scrollCurrent) * scrollLerp;

    // ── Scroll progress (0 → 1) with ease-out ─
    const wrapperH   = heroWrapper.offsetHeight;
    const viewportH  = window.innerHeight;
    scrollDist       = wrapperH - viewportH; // ~75vh scroll room
    const linearProg = Math.max(0, Math.min(1, scrollCurrent / scrollDist));
    const progress   = easeOutPow(linearProg);

    // ── Compute transform values ─────────────
    // Scale: 1 → 0.35 (eased — settles slowly at end)
    const scale = 1 - progress * 0.65;
    // TranslateY: 0 → -60px (restrained upward travel)
    const ty = progress * -60;
    // Mouse rotation: ±8° max, decays aggressively with scroll
    const mouseInfluence = Math.max(0, 1 - progress * 0.92);
    const maxRot = 8;
    const ry =  mouseCurrentX * maxRot * mouseInfluence;
    const rx = -mouseCurrentY * maxRot * mouseInfluence;

    // ── Single combined transform ────────────
    heroTitle.style.transform =
      `scale(${scale}) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg)`;

    // ── Fade tagline & scroll indicator ──────
    const fadeOpacity = Math.max(0, 1 - progress * 3.5);
    heroTagline.style.opacity = fadeOpacity;
    heroTagline.style.transform = `translateY(${progress * -20}px)`;
    scrollIndicator.style.opacity = fadeOpacity;

    requestAnimationFrame(heroTransformLoop);
  }

  // Initialize scroll target
  scrollTarget = window.scrollY;
  scrollCurrent = scrollTarget;
  heroTransformLoop();


  // ── 5. Navbar Scroll Behaviour ──────────────────
  const navbar = document.getElementById('navbar');
  const sections = document.querySelectorAll('.section, .hero');
  const navLinks = document.querySelectorAll('.nav-links a');

  function onScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    let current = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 200;
      if (window.scrollY >= top) {
        current = sec.getAttribute('id');
      }
    });
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();


  // ── 5. Section Reveal on Scroll ────────────────
  const reveals = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach(el => revealObserver.observe(el));


  // ── 6. Secure Send Logic (Unified Flow) ──────────
  const btnProcessSecure = document.getElementById('btn-process-secure');
  const secretInput      = document.getElementById('secret-input');
  const receiverEmailIn  = document.getElementById('receiver-email-input');
  const senderImageIn    = document.getElementById('sender-image-input');
  const uploadZone       = document.getElementById('image-upload-zone');
  const previewImg       = document.getElementById('preview-img');
  const scannerPreview   = document.getElementById('scanner-preview');
  const scannerContent   = document.getElementById('scanner-content');
  const scannerLine      = document.getElementById('scanner-line');
  
  const encryptProgress  = document.getElementById('encrypt-progress-container');
  const encryptBar       = document.getElementById('encrypt-progress-fill');
  const encryptStatus    = document.getElementById('encrypt-status');
  const downloadReady    = document.getElementById('download-ready');
  const downloadLink     = document.getElementById('download-link');

  // Trigger file input on zone click
  uploadZone.addEventListener('click', () => senderImageIn.click());

  // Image preview handling
  senderImageIn.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        previewImg.src = ev.target.result;
        scannerContent.style.display = 'none';
        scannerPreview.classList.add('active');
        scannerLine.classList.add('active');
        setTimeout(() => scannerLine.classList.remove('active'), 1500);
      };
      reader.readAsDataURL(file);
    }
  });

  /** Update progress UI */
  function updateEncryptProgress(percent, status) {
    encryptProgress.classList.add('active');
    encryptBar.style.width = percent + '%';
    encryptStatus.textContent = status;
  }

  // Encrypt + Embed + Download handler
  btnProcessSecure.addEventListener('click', async () => {
    const message = secretInput.value.trim();
    const email   = receiverEmailIn.value.trim();
    const file    = senderImageIn.files[0];

    if (!message || !email || !file) {
      alert('Missing required fields (message, email, or image)');
      return;
    }

    btnProcessSecure.disabled = true;
    downloadReady.classList.remove('active');
    
    try {
      updateEncryptProgress(10, 'Initializing security modules...');
      await new Promise(r => setTimeout(r, 600));
      
      updateEncryptProgress(30, 'Encrypting message with AES-GCM...');
      await new Promise(r => setTimeout(r, 800));

      updateEncryptProgress(60, 'Wrapping keys with RSA-2048...');
      
      const formData = new FormData();
      formData.append('message', message);
      formData.append('receiver_email', email);
      formData.append('image', file);

      updateEncryptProgress(80, 'Embedding into carrier pixels (LSB)...');

      const response = await fetch('/api/encrypt', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Encryption failed');
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      
      updateEncryptProgress(100, 'Security vault generation complete');
      
      setTimeout(() => {
        encryptProgress.classList.remove('active');
        downloadReady.classList.add('active');
        downloadLink.href = url;
        btnProcessSecure.disabled = false;
        // Scroll to download UX
        downloadReady.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);

    } catch (err) {
      alert('Error: ' + err.message);
      encryptProgress.classList.remove('active');
      btnProcessSecure.disabled = false;
    }
  });


  // ── 7. Decrypt Logic (Receiver Flow) ─────────────
  const btnDecrypt        = document.getElementById('btn-decrypt-process');
  const decryptEmail      = document.getElementById('decrypt-email');
  const decryptUpload     = document.getElementById('decrypt-upload-zone');
  const decryptFileInput  = document.getElementById('decrypt-file-input');
  const decryptLabel      = document.getElementById('decrypt-upload-label');
  
  const decryptProgress   = document.getElementById('decrypt-progress-container');
  const decryptBar        = document.getElementById('decrypt-progress-fill');
  const decryptStatus     = document.getElementById('decrypt-status');
  const decryptedOut      = document.getElementById('decrypted-output');
  const decryptedText     = document.getElementById('decrypted-text');
  const unauthorizedWarn  = document.getElementById('unauthorized-warning');

  decryptUpload.addEventListener('click', () => decryptFileInput.click());
  
  decryptFileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      decryptLabel.textContent = e.target.files[0].name;
    }
  });

  function updateDecryptProgress(percent, status) {
    decryptProgress.classList.add('active');
    decryptBar.style.width = percent + '%';
    decryptStatus.textContent = status;
  }

  btnDecrypt.addEventListener('click', async () => {
    const email = decryptEmail.value.trim();
    const file  = decryptFileInput.files[0];

    if (!email || !file) {
      alert('Email and stego image are required');
      return;
    }

    btnDecrypt.disabled = true;
    decryptedOut.classList.remove('active');
    unauthorizedWarn.classList.remove('active');

    try {
      updateDecryptProgress(20, 'Connecting to secure node...');
      await new Promise(r => setTimeout(r, 600));

      updateDecryptProgress(50, 'Extracting LSB payload...');
      
      const formData = new FormData();
      formData.append('email', email);
      formData.append('image', file);

      const response = await fetch('/api/decrypt', {
        method: 'POST',
        body: formData
      });

      if (response.status === 403) {
        updateDecryptProgress(100, 'Identity verification failed');
        setTimeout(() => {
          decryptProgress.classList.remove('active');
          unauthorizedWarn.classList.add('active');
          btnDecrypt.disabled = false;
        }, 500);
        return;
      }

      if (!response.ok) {
        throw new Error('Verification failed');
      }

      updateDecryptProgress(80, 'Decrypting RSA keys...');
      await new Promise(r => setTimeout(r, 800));

      const data = await response.json();
      
      updateDecryptProgress(100, 'Access Granted');
      
      setTimeout(() => {
        decryptProgress.classList.remove('active');
        decryptedOut.classList.add('active');
        typeText(decryptedText, data.message, 30);
        btnDecrypt.disabled = false;
      }, 500);

    } catch (err) {
      alert('Error: ' + err.message);
      decryptProgress.classList.remove('active');
      btnDecrypt.disabled = false;
    }
  });

  /** typeText — simulates typing effect into an element */
  function typeText(el, text, speed) {
    el.textContent = '';
    let idx = 0;
    const interval = setInterval(() => {
      el.textContent += text[idx];
      idx++;
      if (idx >= text.length) clearInterval(interval);
    }, speed);
  }


  // ── Mobile Nav Toggle ──────────────────────────
  const navToggle = document.getElementById('nav-toggle');
  const navLinksUl = document.querySelector('.nav-links');
  navToggle.addEventListener('click', () => {
    const isOpen = navLinksUl.style.display === 'flex';
    navLinksUl.style.display = isOpen ? 'none' : 'flex';
    navLinksUl.style.flexDirection = 'column';
    navLinksUl.style.position = 'absolute';
    navLinksUl.style.top = '100%';
    navLinksUl.style.left = '0';
    navLinksUl.style.right = '0';
    navLinksUl.style.background = 'rgba(6, 9, 15, 0.95)';
    navLinksUl.style.padding = '20px 32px';
    navLinksUl.style.gap = '16px';
    navLinksUl.style.backdropFilter = 'blur(20px)';
    if (isOpen) {
      navLinksUl.removeAttribute('style');
    }
  });

  // Add a spinning class for the encrypt button icon
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .spin-icon { animation: spin 1s linear infinite; }
  `;
  document.head.appendChild(styleSheet);


  // ── 11. Auth Modal System ─────────────────────
  const authOverlay   = document.getElementById('auth-overlay');
  const authModal     = document.getElementById('auth-modal');
  const authClose     = document.getElementById('auth-close');
  const loginForm     = document.getElementById('auth-login-form');
  const signupForm    = document.getElementById('auth-signup-form');
  const successPanel  = document.getElementById('auth-success');
  const navLoginBtn   = document.getElementById('nav-login-btn');
  const navSignupBtn  = document.getElementById('nav-signup-btn');

  /** Show a specific form, hide others */
  function showForm(target) {
    [loginForm, signupForm, successPanel].forEach(f => f.classList.add('auth-form--hidden'));
    target.classList.remove('auth-form--hidden');
  }

  /** Open modal */
  function openAuth(mode) {
    showForm(mode === 'signup' ? signupForm : loginForm);
    authOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  /** Close modal */
  function closeAuth() {
    authOverlay.classList.remove('active');
    document.body.style.overflow = '';
    // Clear inputs and errors after transition
    setTimeout(() => {
      authOverlay.querySelectorAll('input').forEach(i => i.value = '');
      authOverlay.querySelectorAll('.auth-error').forEach(e => e.textContent = '');
    }, 400);
  }

  // Nav button triggers
  navLoginBtn.addEventListener('click', () => openAuth('login'));
  navSignupBtn.addEventListener('click', () => openAuth('signup'));

  // Close triggers
  authClose.addEventListener('click', closeAuth);
  authOverlay.addEventListener('click', (e) => {
    if (e.target === authOverlay) closeAuth();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authOverlay.classList.contains('active')) closeAuth();
  });

  // Toggle between login/signup
  document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    showForm(signupForm);
  });
  document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    showForm(loginForm);
  });

  // ── Signup — store in localStorage ──────────
  document.getElementById('signup-submit').addEventListener('click', () => {
    const name    = document.getElementById('signup-name').value.trim();
    const email   = document.getElementById('signup-email').value.trim();
    const pass    = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const err     = document.getElementById('signup-error');

    if (!name || !email || !pass) { err.textContent = 'All fields are required.'; return; }
    if (pass.length < 4) { err.textContent = 'Password must be at least 4 characters.'; return; }
    if (pass !== confirm) { err.textContent = 'Passwords do not match.'; return; }

    // Store credentials
    const users = JSON.parse(localStorage.getItem('cv_users') || '{}');
    if (users[email]) { err.textContent = 'Email already registered.'; return; }
    users[email] = { name, password: pass };
    localStorage.setItem('cv_users', JSON.stringify(users));

    // Success
    showForm(successPanel);
    setTimeout(() => {
      closeAuth();
      setTimeout(() => {
        document.getElementById('encrypt').scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }, 1500);
  });

  // ── Login — check localStorage ─────────────
  document.getElementById('login-submit').addEventListener('click', () => {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const err   = document.getElementById('login-error');

    if (!email || !pass) { err.textContent = 'All fields are required.'; return; }

    const users = JSON.parse(localStorage.getItem('cv_users') || '{}');
    if (!users[email] || users[email].password !== pass) {
      err.textContent = 'Invalid credentials.';
      return;
    }

    // Success
    showForm(successPanel);
    setTimeout(() => {
      closeAuth();
      setTimeout(() => {
        document.getElementById('encrypt').scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }, 1500);
  });


  // ── 12. Custom Cursor System ──────────────────
  const cursorDot  = document.getElementById('cursor-dot');
  const cursorRing = document.getElementById('cursor-ring');

  // Mouse target (raw from event)
  let cursorTargetX = 0, cursorTargetY = 0;
  // Separate lerp positions: dot nearly instant, ring smooth
  let dotCX = 0, dotCY = 0;
  let ringCX = 0, ringCY = 0;

  /** Store mouse target — no DOM writes here */
  document.addEventListener('mousemove', (e) => {
    cursorTargetX = e.clientX;
    cursorTargetY = e.clientY;
  });

  /** Cursor loop: dot near-instant, ring premium-smooth, GPU via translate3d */
  function cursorLoop() {
    const dotLerp  = 0.85;  // near-instant, no visible delay
    const ringLerp = 0.20;  // responsive but premium inertia

    dotCX += (cursorTargetX - dotCX) * dotLerp;
    dotCY += (cursorTargetY - dotCY) * dotLerp;
    ringCX += (cursorTargetX - ringCX) * ringLerp;
    ringCY += (cursorTargetY - ringCY) * ringLerp;

    // GPU-accelerated positioning via translate3d
    cursorDot.style.transform  = `translate3d(${dotCX - 4}px, ${dotCY - 4}px, 0)`;
    cursorRing.style.transform = `translate3d(${ringCX - 20}px, ${ringCY - 20}px, 0)`;

    requestAnimationFrame(cursorLoop);
  }
  cursorLoop();

  /** Interactive hover detection — expand ring on buttons/links/cards */
  const hoverTargets = 'a, button, .btn, .feature-card, .flow-node, .nav-cta, .nav-links a, .scanner-frame, .terminal-card, input, textarea';

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(hoverTargets)) {
      cursorRing.classList.add('hover');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(hoverTargets)) {
      cursorRing.classList.remove('hover');
    }
  });

  /** Click press — compress ring */
  document.addEventListener('mousedown', () => {
    cursorRing.classList.add('click');
  });
  document.addEventListener('mouseup', () => {
    cursorRing.classList.remove('click');
  });

  /** Hide cursor elements when mouse leaves window */
  document.addEventListener('mouseleave', () => {
    cursorDot.style.opacity  = '0';
    cursorRing.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursorDot.style.opacity  = '1';
    cursorRing.style.opacity = '0.7';
  });

});
