/* 文章页烟花背景：仅暗色模式运行，浅色模式自动暂停并清空画布 */
(function () {
  'use strict';

  var canvas = document.getElementById('fireworks-bg');
  if (!canvas || !canvas.getContext) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var ctx = canvas.getContext('2d');
  var particles = [];
  var rockets = [];
  var autoTimer = 0;
  var running = false;
  var rafId = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  var PALETTES = [
    ['#5eead4', '#7dd3fc', '#38bdf8', '#2dd4bf'],
    ['#ff8a7a', '#ffd93d', '#ff9f43', '#ffb703'],
    ['#a29bfe', '#fda4af', '#fcd34d', '#c4b5fd'],
    ['#6ee7b7', '#34d399', '#99f6e4', '#a7f3d0'],
    ['#f9a8d4', '#fbcfe8', '#fda4af', '#67e8f9']
  ];

  function Particle(x, y, vx, vy, color, life, size) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.gravity = 0.06;
    this.trail = [];
  }
  Particle.prototype.update = function () {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
    this.vx *= 0.98;
    this.vy *= 0.98;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  };
  Particle.prototype.draw = function () {
    var alpha = this.life / this.maxLife;
    for (var i = 0; i < this.trail.length; i++) {
      var a = (i / this.trail.length) * alpha * 0.4;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, this.size * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fillStyle = this.color + Math.floor(a * 255).toString(16).padStart(2, '0');
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.fill();
  };

  function Rocket(x, targetY) {
    this.x = x;
    this.y = canvas.height;
    this.targetY = targetY;
    this.vy = -12 - Math.random() * 5;
    this.vx = (Math.random() - 0.5) * 2;
    this.palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    this.trail = [];
    this.exploded = false;
  }
  Rocket.prototype.update = function () {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 12) this.trail.shift();
    this.vy += 0.25;
    this.x += this.vx;
    this.y += this.vy;
    if (this.vy >= 0 || this.y <= this.targetY) {
      this.exploded = true;
    }
  };
  Rocket.prototype.draw = function () {
    for (var i = 0; i < this.trail.length; i++) {
      var a = (i / this.trail.length) * 0.6;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, 2 * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,255,245,' + a.toFixed(2) + ')';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  };
  Rocket.prototype.explode = function () {
    var count = 70 + Math.floor(Math.random() * 50);
    var color = this.palette[Math.floor(Math.random() * this.palette.length)];
    var color2 = this.palette[Math.floor(Math.random() * this.palette.length)];
    var type = Math.floor(Math.random() * 3);

    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2;
      var speed, c;
      if (type === 0) {
        speed = 2 + Math.random() * 5;
        c = Math.random() < 0.5 ? color : color2;
      } else if (type === 1) {
        var r = Math.random();
        speed = r < 0.3 ? 1 + Math.random() * 2 : 3 + Math.random() * 6;
        c = r < 0.3 ? '#ffffff' : color;
      } else {
        speed = 3 + Math.random() * 4 + Math.sin(angle * 5) * 2;
        c = color;
      }
      var vx = Math.cos(angle) * speed * (0.8 + Math.random() * 0.4);
      var vy = Math.sin(angle) * speed * (0.8 + Math.random() * 0.4);
      particles.push(new Particle(this.x, this.y, vx, vy, c, 60 + Math.floor(Math.random() * 40), 1.5 + Math.random() * 2));
    }
    for (var j = 0; j < 8; j++) {
      var a2 = Math.random() * Math.PI * 2;
      var s2 = 1 + Math.random() * 3;
      particles.push(new Particle(this.x, this.y, Math.cos(a2) * s2, Math.sin(a2) * s2 - 2, '#d9fff5', 90 + Math.floor(Math.random() * 30), 2 + Math.random()));
    }
  };

  function autoLaunch() {
    var x = canvas.width * 0.15 + Math.random() * canvas.width * 0.7;
    var targetY = canvas.height * 0.1 + Math.random() * canvas.height * 0.35;
    rockets.push(new Rocket(x, targetY));
  }

  function loop() {
    if (!running) return;
    ctx.fillStyle = 'rgba(6,6,15,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    autoTimer++;
    if (autoTimer > 90) {
      autoLaunch();
      autoTimer = -Math.floor(Math.random() * 40);
    }

    for (var i = rockets.length - 1; i >= 0; i--) {
      rockets[i].update();
      rockets[i].draw();
      if (rockets[i].exploded) {
        rockets[i].explode();
        rockets.splice(i, 1);
      }
    }

    for (var j = particles.length - 1; j >= 0; j--) {
      particles[j].update();
      particles[j].draw();
      if (particles[j].life <= 0) particles.splice(j, 1);
    }

    rafId = requestAnimationFrame(loop);
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    autoLaunch();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    rockets = [];
    particles = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', function () {
    if (running) resize();
  });

  /* 跟随主题启停：custom-script.js 切换主题时派发 themechange 事件 */
  if (isDark()) start();
  window.addEventListener('themechange', function (e) {
    if (e.detail && e.detail.theme === 'dark') start();
    else stop();
  });
})();
