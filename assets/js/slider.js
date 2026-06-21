// Lightweight, dependency-free image slider.
// Usage: <div class="slider"> <img ...> <img ...> </div>
// Auto-initializes every .slider on the page: crossfade, auto-advance,
// nav dots, pause on hover, and respects prefers-reduced-motion.
(function () {
  var INTERVAL = 3000;
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initSlider(slider) {
    var slides = Array.prototype.slice.call(slider.querySelectorAll("img"));
    if (!slides.length) return;

    slides.forEach(function (img, idx) {
      img.classList.toggle("is-active", idx === 0);
      img.draggable = false; // block native image ghost-drag
    });

    // Single image: nothing to animate.
    if (slides.length < 2) return;

    var index = 0;

    // Build nav dots.
    var dots = document.createElement("div");
    dots.className = "slider__dots";
    var dotEls = slides.map(function (_, idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "slider__dot" + (idx === 0 ? " is-active" : "");
      b.setAttribute("aria-label", "Go to slide " + (idx + 1));
      b.addEventListener("click", function () {
        goTo(idx);
        restart();
      });
      dots.appendChild(b);
      return b;
    });
    slider.appendChild(dots);

    function goTo(n) {
      slides[index].classList.remove("is-active");
      dotEls[index].classList.remove("is-active");
      index = (n + slides.length) % slides.length;
      slides[index].classList.add("is-active");
      dotEls[index].classList.add("is-active");
    }

    var timer = null;
    function start() {
      if (reduceMotion) return; // let users navigate manually instead
      timer = window.setInterval(function () {
        goTo(index + 1);
      }, INTERVAL);
    }
    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }
    function restart() {
      stop();
      start();
    }

    slider.addEventListener("mouseenter", stop);
    slider.addEventListener("mouseleave", start);

    // Swipe / drag gesture (touch + mouse via Pointer Events).
    var SWIPE_THRESHOLD = 40;
    var startX = null;
    slider.addEventListener("pointerdown", function (e) {
      startX = e.clientX;
      stop();
    });
    slider.addEventListener("pointerup", function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        goTo(dx < 0 ? index + 1 : index - 1);
      }
      startX = null;
      start();
    });
    slider.addEventListener("pointercancel", function () {
      startX = null;
      start();
    });

    start();
  }

  document.querySelectorAll(".slider").forEach(initSlider);
})();
